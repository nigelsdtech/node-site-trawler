var cfg                = require('config'),
    jsonFile           = require('jsonfile'),
    log4js             = require('log4js'),
    Q                  = require('q'),
    reporter           = require('reporter');

var TwitterTrawler, GumtreeTrawler, EWeLinkTrawler;


/*
* Scrape various sites and apis for data you want
*
*/


module.exports = function (params, programComplete) {

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


  var startTime = new Date()

  // Load in all previously seen results
  var savedData = {}
  try {
    savedData = jsonFile.readFileSync(cfg.savedDataFile)
  } catch (e) {
    if (e.code != "ENOENT") {throw e}
  }

  // Load in all the trawlers and any known results about them

  var trawlers  = []

  for (var i = 0; i < cfg.trawlers.length; i++) {

    var trawler = cfg.trawlers[i]
    var tr

    switch(trawler.trawlModel) {

      case 'ewelink':
        if ( !EWeLinkTrawler ) { EWeLinkTrawler = require('./classes/EWeLinkTrawler.js'); }
        tr = new EWeLinkTrawler(trawler.setup)
        break;

      case 'gumtree':
        if ( !GumtreeTrawler ) { GumtreeTrawler = require('./classes/GumtreeTrawler.js'); }
        tr = new GumtreeTrawler(trawler.setup)
        break;

      case 'twitter':
        if ( !TwitterTrawler ) { TwitterTrawler = require('./classes/TwitterTrawler.js'); }
        tr = new TwitterTrawler(trawler.setup)
        break;

      default:
        throw new Error ("Unknown trawler: " + trawler.trawlModel)
    }

    if (savedData[trawler.setup.id]) {
      tr.setSavedData({
        savedData: savedData[trawler.setup.id]
      })
    }

    trawlers.push(tr)

  }


  // And kick off the job to get the results
  var trawlJobs = []

  trawlers.forEach(function(t) {

    var deferred = Q.defer()
    trawlJobs.push(deferred.promise)

    t.getResults(null, function (err, results) {

      if (err) { deferred.reject(err); return }

      if (results.length == 0) {
        deferred.resolve("")
      } else {
        deferred.resolve(t.getResultsString())
      }

    })

  })


  Q.allSettled(trawlJobs)
  .then (function (results) {

    var ret = ""

    results.forEach(function (result, i) {

      if (result.state === "fulfilled") {

        var tName = trawlers[i].id

        if (result.value != "") {
          ret += "<p> Trawler: " + tName
          ret += result.value
        }

      } else {
          var reason = result.reason;
          log.error('Result %s is in state %s (%s)', i, result.state, result.reason)
      }
    });



    var jobs = []

    // Nothing back from any trawler?

    if (ret != "") {


      // Otherwise send a report
      var deferredRpt = Q.defer()
      jobs.push(deferredRpt.promise)

      log.info('Sending completion notice...')
      log.info("Results:")
      log.info(ret)

      reporter.sendCompletionNotice({
        body: ret
      }, function (err, cb) {
        if (err) {return deferredRpt.reject(err)}
        log.info('Sent completion notice.')
        deferredRpt.resolve(null)
      })

    }

    // And save relevant data from this run to be used in the next run
    var newDataExists = false
    trawlers.forEach(function(t) {
      var dataToSave = t.getDataToSave()
      if (Object.keys(dataToSave).length != 0) {
        savedData[t.id] = dataToSave;
        newDataExists = true
      }
    })

    if (newDataExists) {
      var deferredSave = Q.defer()
      jobs.push(deferredSave.promise)

      log.info('Saving data: ' + JSON.stringify(savedData))
      jsonFile.writeFile(cfg.savedDataFile, savedData, function (err) {
        if (err) {return deferredSave.reject(err)}
        log.info('Saved data to file.')
        deferredSave.resolve(null)
      })
    }


    return Q.allSettled(jobs)

  }).catch (function (err) {
    log.error('Error in main: ' + err)
  })
  .fin(function () {
    var endTime = new Date()

    var serviceTime = ((endTime.getTime() - startTime.getTime()) / 1000)
    log.info('Request served in %ss.', serviceTime)

    log.info('Ending program.')
    programComplete()
  })

}
