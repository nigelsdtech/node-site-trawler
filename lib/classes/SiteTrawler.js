/**
 * This interface class represents a website trawler
 */


var cfg     = require('config');
var log4js  = require('log4js');

/*
 * Logs
 */
log4js.configure(cfg.log.log4jsConfigs);

var log = log4js.getLogger(cfg.log.appName);
log.setLevel(cfg.log.level);




/**
 * SiteTrawler model constructor.
 * @param {object}      params             - Params to be passed in
 * @param {string}      params.id          - English name for the trawler instance. Will be used as a unique identifier.
 * @param {maxResults=} params.maxResults  - Max number of results to be returned from the site being trawled.
 * @constructor
 */
function SiteTrawler (params) {

  this.id = params.id

  if (params.maxResults) { this.maxResults = params.maxResults }

  // To be set by the getResults functions
  this.results = []

  this.savedData = {}
  this.dataToSave = {}

  this.log("info", "initialized.")
}


var method = SiteTrawler.prototype


/**
 * SiteTrawler.log
 *
 * @desc Writes a log
 *
 * @alias SiteTrawler.log
 *
 * @param  {string}   level - log level
 * @param  {callback} msg   - Log message
 */
method.log = function (level, msg) {
  log[level]("[%s] - %s", this.id, msg)
}


/**
 * SiteTrawler.getDataToSave
 *
 * @desc Get the data to be saved to file for the next run
 *
 * @param  {object}   params    - Parameters for request (currently unused)
 *
 * @returns {object} dataToSave -
 */
method.getDataToSave = function (params) {
  return this.dataToSave
}

/**
 * SiteTrawler.getResults
 *
 * @desc Get the next x results from this trawler
 *
 * @alias SiteTrawler.getResults
 *
 * @param  {object}   params   - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, results[])
 *                               where results are objects of the form {
 *                                 id: A unique identifier of the result resource on the site (eg a tweet id, ebay listing id, etc),
 *                                 contents: The contents of the result resource (images, prices, etc)
 *                               }
 */
method.getResults = function (params,cb) {

  var self = this

  self.results  = []

  self.loadResults(null,function (err, results) {

    if (err) {
      self.log('error', 'Failed to load results: ' + err)
      cb("Failed to load results: " + err)
      return null
    }

    self.log('info', 'Got ' + results.length + ' results.')

    if (results.length == 0) { cb(null,results); return null }


    var maxResults = self.maxResults

    // Apply various filters to the returned results
    var i = 0
    while (true) {

      // Only interested in up to (configurable number) results.
      if (i >= results.length || i >= maxResults) {
        results.splice(i, (results.length - i) )
        break
      }

      var result = results[i]

      self.log('debug', '(' + i + ') Examining result:')
      self.log('debug', JSON.stringify(result,null,"\t"))

      // Filter out on custom criteria (if specified)
      if (!self.resultPassesCustomFilters({result: result})) {
        self.log('info', 'Filtering out result.') 
        results.splice(i,1)
        continue
      }

      i++
    }

    self.log('debug', 'Results in order - ' + JSON.stringify(results))
    self.results = results

    cb(null,results)

  })
}


/**
 * SiteTrawler.getResultsString
 *
 * @desc Get an English string describing the contents of the results. This function needs to be overridden by each trawler subclass.
 *
 * @alias SiteTrawler.getResultString
 *
 */
method.getResultsString = function () {

  this.log('error', 'getResultsString needs to be overridden')
  throw new Error('getResultsString needs to be overridden')
}


/**
 * SiteTrawler.loadResults
 *
 * @desc Load the list of results from the data service. This needs to be overridden by the subclass based on the relevant service.
 *
 * @alias SiteTrawler.results
 *
 * @param  {object} params     - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, results[])
 *                               where results are objects of the form {
 *                                 id: A unique identifier of the result resource on the site (eg a tweet id, ebay listing id, etc),
 *                                 contents: The contents of the result resource (images, prices, etc)
 *                               }
 */
method.loadResults = function (params,cb) {

  this.log('error', 'loadResults needs to be overridden')
  cb('loadResults needs to be overridden')
}



/**
 * SiteTrawler.resultPassesCustomFilters
 *
 * @desc Apply a set of filters specific to the subclass to see if the result is suitable.
 *
 * @alias SiteTrawler.resultPassesCustomFilters
 *
 * @param   {object}   params         - Parameters for request
 * @param   {object}   params.result  - Information about the result. The specifics of the result can be changed per subclass
 * @returns {boolean}  true if the result is deemed suitable
 *
 */
method.resultPassesCustomFilters = function (params) {
  // Add your own custom filters in the subclass
  return true
}


/**
 * SiteTrawler.setSavedData
 *
 * @desc Load in a set of data gathered by this trawler on a previous run
 *
 * @param  {object}   params           - Parameters for request
 * @param  {object}   params.savedData - The actual data results
 */
method.setSavedData = function (params) {
  this.savedData = params.savedData
}


module.exports = SiteTrawler
