const
  cfg                = require('config'),
  GsheetsModel       = require('gsheets-model'),
  jsonFile           = require('jsonfile'),
  log4js             = require('log4js'),
  reporter           = require('reporter'),
  {promisify}        = require('util');

var TwitterTrawler, GumtreeTrawler, EWeLinkTrawler;


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
   * Main program
   */


  log.info('Begin script');
  log.info('============');

  const startTime = new Date()

  try {

    // Load in all previously seen results
    var savedData = {}
    try {
      savedData = jsonFile.readFileSync(cfg.savedDataFile)
    } catch (e) {
      if (e.code != "ENOENT") {throw e}
    }

    // Load in all the trawlers and any known results about them

    const loadedTrawlers = await Promise.all(cfg.trawlers
    .map( async (t) => {

      // Instantiate the trawler
      const trawler = ( () => {

        switch(t.trawlModel) {

          case 'ewelink':
            if ( !EWeLinkTrawler ) { EWeLinkTrawler = require('./classes/EWeLinkTrawler.js'); }
            return new EWeLinkTrawler(t.setup)

          case 'gumtree':
            if ( !GumtreeTrawler ) { GumtreeTrawler = require('./classes/GumtreeTrawler.js'); }
            return new GumtreeTrawler(t.setup)

          case 'twitter':
            if ( !TwitterTrawler ) { TwitterTrawler = require('./classes/TwitterTrawler.js'); }
            return new TwitterTrawler(t.setup)

          default:
            throw new Error ("Unknown trawler: " + t.trawlModel)
        }

      })();


      // Register any saved data with the trawler
      if (savedData[t.setup.id]) {
        trawler.setSavedData({
          savedData: savedData[t.setup.id]
        })
      }

      try {

        // Load the results
        const gr = promisify(trawler.getResults).bind(trawler)
        await gr(null)

      } catch (e) {
        log.error(`Trawler (${trawler.id}) error when getting results: ${e}`)
      }

      return trawler

    }))


    /*
     * Save relevant data from this run to be used in the next run
     */

    const s = new GsheetsModel({
      googleScopes:     cfg.auth.googleScopes,
      tokenFile:        cfg.auth.tokenFile,
      tokenDir:         cfg.auth.tokenFileDir,
      clientSecretFile: cfg.auth.clientSecretFile
    });


    const requestPromise = promisify(s.appendValue).bind(s)


    // Gather the data
    const {newDataExists, newDataToSave} = await loadedTrawlers
    .reduce ( async (accumulatorPromise,lt) => {

      const {newDataExists, newDataToSave} = await accumulatorPromise

      const newDataOnCurrentTrawler = lt.getDataToSave()
      const doesNewDataExistOnCurrentTrawler = (Object.keys(newDataOnCurrentTrawler).length > 0)
      
      if (lt.spreadsheet) {

        const spreadsheetLine = lt.getDataToSaveToSpreadsheet()

        if (spreadsheetLine.length > 0) {
          
          log.info(`[${lt.id}] Inserting new row into spreadsheet...(${spreadsheetLine})`)

          const resp = await requestPromise({
            id: lt.spreadsheet.id,
            includeValuesInResponse: true,
            range: lt.spreadsheet.subSheetName,
            resource: {
              majorDimension: "ROWS",
              values: [spreadsheetLine]
            },
            retFields: ["updates(updatedData(range,values))"]
          })

          log.info(`[${lt.id}]: Inserted new row into spreadsheet:`)
          log.info(`[${lt.id}]: ${JSON.stringify(resp)}`)
        }

      }
 
      return Promise.resolve({
        newDataExists: (newDataExists || doesNewDataExistOnCurrentTrawler),
        newDataToSave: Object.assign({},newDataToSave,newDataOnCurrentTrawler)
      })

    }, Promise.resolve({newDataExists: false, newDataToSave: {}}))

    const dataToSaveToFile = Object.assign({},savedData,newDataToSave)


    // Save it to file
    if (newDataExists) {
      log.info('Saving data to file: ' + JSON.stringify(dataToSaveToFile))

      const wf = promisify(jsonFile.writeFile)
      await wf(cfg.savedDataFile, dataToSaveToFile)
      log.info('Saved data to file.')
    }

    // Create an output string for the email
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

      const scn = promisify(reporter.sendCompletionNotice)
      await scn({body: resultsStr})

      log.info('Sent completion notice.')
    }

  } catch (e) {
    log.error(`Problem running the script: ${e}`)
    log.error(`${e.stack}`)
    reporter.handleError({errMsg: e}, () => {})

  } finally {

    const endTime = new Date()

    const serviceTime = ((endTime.getTime() - startTime.getTime()) / 1000)
    log.info('Request served in %ss.', serviceTime)

    log.info('Ending program.')
    programComplete()
  }

}

