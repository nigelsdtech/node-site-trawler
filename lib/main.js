const
  cfg                = require('config'),
  GsheetsModel       = require('gsheets-model'),
  jsonFile           = require('jsonfile'),
  log4js             = require('log4js'),
  reporter           = require('reporter'),
  {promisify}        = require('util');

/*
* Scrape various sites and apis for data you want
*
*/


module.exports = async function (params, programComplete) {

  /*
   * Initialize
   */


  /*
   * Logs
   */
  log4js.configure(cfg.log.log4jsConfigs);

  var log = log4js.getLogger(cfg.log.appName);
  log.setLevel(cfg.log.level);


  /*
   * Job reporter
   */
  reporter.configure(cfg.reporter);


  /*
    * Save relevant data from this run to be used in the next run
    */

  const s = new GsheetsModel({
    googleScopes:     cfg.auth.googleScopes,
    tokenFile:        cfg.auth.tokenFile,
    tokenDir:         cfg.auth.tokenFileDir,
    clientSecretFile: cfg.auth.clientSecretFile
  });

  const appendToSpreadsheet = promisify(s.appendValue).bind(s)



  /*
   * Main program
   */

  await main({
    trawlerSetups: cfg.trawlers,
    log,
    savedDataFile: cfg.savedDataFile,
    appendToSpreadsheet,
    sendCompletionNotice: promisify(reporter.sendCompletionNotice),
    sendErrorNotice: promisify(reporter.handleError)
  })

}


/**
 * 
 * @param {*} param0 
 * @param {object[]}   param0.trawlerSetups
 * @param {object}     param0.log
 * @param {string}     param0.savedDataFile
 * @param {function}   param0.appendToSpreadsheet
 * @param {function}   param0.sendCompletionNotice
 * @param {function}   param0.sendErrorNotice
 */

async function main({
  trawlerSetups,
  log,
  savedDataFile,
  appendToSpreadsheet,
  sendCompletionNotice,
  sendErrorNotice
}) {

  log.info('Begin script');
  log.info('============');

  const startTime = new Date()

  const runtimeErrors = []

  try {

    const savedData = await loadSavedData(savedDataFile)


    // Load in all the trawlers and any known results about them

    const loadedTrawlers = await Promise.all(trawlerSetups
    .map( async (t) => {

      // Instantiate the trawler
      const trawler = loadTrawler(t)

      // Register any saved data with the trawler
      if (savedData[t.setup.id]) {
        trawler.setSavedData({
          savedData: savedData[t.setup.id]
        })
      }

      // Load the results
      await trawler.getResults(null)
      .catch((e) => {
        const errMsg = `[${trawler.id}] - error when getting results: ${JSON.stringify(e)}`
        log.error(errMsg)
        runtimeErrors.push(errMsg)
      })

      return trawler

    }))

    // Run the spreadsheet saves in serial
    await loadedTrawlers
    .reduce( async (_, lt) => {

      if (lt.spreadsheet) {

        const spreadsheetLine = lt.getDataToSaveToSpreadsheet()

        if (spreadsheetLine && spreadsheetLine.length > 0) {
          log.info(`[${lt.id}] Inserting new row into spreadsheet...(${spreadsheetLine})`)

          const resp = await appendToSpreadsheet({
            id: lt.spreadsheet.id,
            includeValuesInResponse: true,
            range: lt.spreadsheet.subSheetName,
            resource: {
              majorDimension: "ROWS",
              values: [spreadsheetLine]
            },
            retFields: ["updates(updatedData(range,values))"]
          })
          .catch( (err) => {
            runtimeErrors.push(`Spreadsheet update failed: ${err}`)
          })

          if (resp) {
            log.info(`[${lt.id}]: Inserted new row into spreadsheet:`)
            log.info(`[${lt.id}]: ${JSON.stringify(resp)}`)
          }
        }

      }

      return Promise.resolve()

    }, Promise.resolve())


    // Gather the data
    const newDataToSave = await loadedTrawlers
    .reduce ( (accumulator,lt) => {
      const newDataOnCurrentTrawler = lt.getDataToSave()
      log.debug(`New data on ${lt.id}: ${JSON.stringify(newDataOnCurrentTrawler)}`)
      if (Object.keys(newDataOnCurrentTrawler).length > 0) {
        return Object.assign({},accumulator, {[lt.id]: newDataOnCurrentTrawler})
      } else {
        return accumulator
      }
      
    }, {})


    // Save it to file
    if (Object.keys(newDataToSave).length > 0 ) {
      const dataToSaveToFile = Object.assign({}, savedData, newDataToSave)
      log.info('Saving data to file: ' + JSON.stringify(dataToSaveToFile))

      const wf = promisify(jsonFile.writeFile)
      await wf(savedDataFile, dataToSaveToFile)
      log.info('Saved data to file.')
    }

    // Create an output string for the errors email
    if (runtimeErrors.length > 0) {
      log.error(`${runtimeErrors.length} runtime errors. Sending error notice...`)
      const e = "Problem running the script: <br>" + runtimeErrors.join('<br>')
      await sendErrorNotice({errMsg: e})
      log.error(`Sent error notice.`)
    }

    // Create an output string for the reports email
    const resultsStr = loadedTrawlers
    .reduce ( (accumulator, trawler) => {

      const resultsStr = trawler.getResultsString()

      if (resultsStr == "") {
        return accumulator
      }

      return `${accumulator}<p> Trawler: ${trawler.id} ${resultsStr}`

    }, "")

    // Email it out
    if (resultsStr != "") {

      log.info('Sending completion notice...')
      log.info("Results:")
      log.info(resultsStr)

      await sendCompletionNotice({body: resultsStr})

      log.info('Sent completion notice.')
    }

  } catch (e) {
    log.error(`Problem running the script: ${e}`)
    log.error(`${e.stack}`)
    await sendErrorNotice({errMsg: e})

  } finally {

    const endTime = new Date()

    const serviceTime = ((endTime.getTime() - startTime.getTime()) / 1000)
    log.info('Request served in %ss.', serviceTime)

    log.info('Ending program.')
  }

}

/**
 *
 *  Load in all previously seen results
 *
 */
function loadSavedData (savedDataFile) {

  const rfs = promisify(jsonFile.readFile)
  const ret = rfs(savedDataFile)
  .catch( (e) => {
    if (e.code != "ENOENT") {
      throw new Error(`Could not open data file: ${e}`)
    } else {
      return Promise.resolve({})
    }
  })

  return ret

}



var TwitterTrawler, GumtreeTrawler, EWeLinkTrawler, EWeLinkDeviceController;

/*
 *
 */
function loadTrawler (trawlerConfig) {
  
  switch(trawlerConfig.trawlModel) {

    case 'ewelink':
      if ( !EWeLinkTrawler ) { EWeLinkTrawler = require('./classes/EWeLinkTrawler.js'); }
      return new EWeLinkTrawler(trawlerConfig.setup)

    case 'ewelinkDeviceController':
      if ( !EWeLinkDeviceController ) { EWeLinkDeviceController = require('./classes/EWeLinkDeviceController.js'); }
      return new EWeLinkDeviceController(trawlerConfig.setup)

    case 'gumtree':
      if ( !GumtreeTrawler ) { GumtreeTrawler = require('./classes/GumtreeTrawler.js'); }
      return new GumtreeTrawler(trawlerConfig.setup)

    case 'twitter':
      if ( !TwitterTrawler ) { TwitterTrawler = require('./classes/TwitterTrawler.js'); }
      return new TwitterTrawler(trawlerConfig.setup)

    default:
      throw new Error ("Unknown trawler: " + trawlerConfig.trawlModel)
  }

}
