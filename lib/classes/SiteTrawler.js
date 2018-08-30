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
 * @param {object}      params                 - Params to be passed in
 * @param {maxResults=} params.maxResults      - Max number of results to be returned from the site being trawled.
 * @param {object=}     params.subClassSetup   - The setup object originally sent to the subclass
 * @param {regex[]}     params.regexMatches    - A regular expression to run against the result. If provided, only result descriptions matching this regex will be returned. Optional arg (optional)
 * @param {string}      params.regexMatchField - The result field against which to match the regex (optional)
 * @constructor
 */
function SiteTrawler (params) {

  this.id = params.subClassSetup.id

  if (params.subClassSetup.maxResults) { this.maxResults = params.subClassSetup.maxResults }

  // To be set by the getResults functions
  this.results = []

  this.savedData = {}
  this.dataToSave = {}

  if (params.subClassSetup.regexMatches && params.regexMatchField) {
    this.regexMatchField = params.regexMatchField
    this.regexMatches    = []

    for (var i = 0; i < params.subClassSetup.regexMatches.length; i++) {
      var rm = params.subClassSetup.regexMatches[i]
      this.regexMatches.push( new RegExp(rm.pattern, rm.flags) )
    }
  }

  this.recordHighestSeenId = params.recordHighestSeenId
  this.recordAllSeenIds    = params.recordAllSeenIds

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

  self.loadResults(null,function (err) {

    if (err) {
      self.log('error', 'Failed to load results: ' + err)
      cb("Failed to load results: " + err)
      return null
    }

    self.log('info', 'Got ' + self.results.length + ' results.')

    // Apply various filters to the returned results
    self.results = self.results.filter(function (result) {
      var add =         self.resultPassesCommonFilters({result: result})
      add     = (add && self.resultPassesCustomFilters({result: result}))
      return add
    })

    // Prune down to the max number of results
    if (self.maxResults && self.results.length > self.maxResults) {
      self.results.splice(0, self.maxResults )
    }

    // Record the seen Ids and/or highestSeenId
    if (self.recordHighestSeenId || self.recordAllSeenIds) {

      var oldSeen = (self.savedData.seenIds)?       self.savedData.seenIds       : [];
      var newSeen = [];
      var highest = (self.savedData.highestSeenId)? self.savedData.highestSeenId : -1;

      for (var i = 0; i < self.results.length; i++) {
        var id = self.results[i].id
        newSeen.push(id)
        if (self.recordHighestSeenId && id > highest) { self.dataToSave.highestSeenId = id }
      }

      if (self.recordAllSeenIds && newSeen.length > 0) {
        self.dataToSave.seenIds = oldSeen.concat(newSeen)
      }
    }


    self.log('info', 'Final results in order - ' + JSON.stringify(self.results))

    cb(null,self.results)

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

  cb('loadResults needs to be overridden')
}


/**
 * SiteTrawler.resultPassesCommonFilters
 *
 * @desc Apply a set of filters specific to the subclass to see if the result is suitable.
 *
 * @alias SiteTrawler.resultPassesCommonFilters
 *
 * @param   {object}   params         - Parameters for request
 * @param   {object}   params.result  - Information about the result. The specifics of the result can be changed per subclass
 * @returns {boolean}  true if the result is deemed suitable
 *
 */
method.resultPassesCommonFilters = function (params) {

  var self = this

  var rid = params.result.id

  self.log('info', 'Filtering result [' + rid + '] - ' + JSON.stringify(params.result))


  // Run regex checks

  var hasPassed = false

  if (self.regexMatches) {

    for (var i = 0; i < self.regexMatches.length; i++) {

      var re = self.regexMatches[i]

      if (params.result[self.regexMatchField].match(re)) {
        hasPassed = true;
        self.log('info','Result [' + rid + '] matched regex - ' + re.toString() + ' - ' + params.result[self.regexMatchField])
        break;
      }
    }

  } else {
    hasPassed = true
  }

  if (!hasPassed) {
    self.log('info','Result [' + rid + '] skipped: Failed regex matches.')
    return false
  }


  // If the trawler has a concept of a highestSeenId, compare this Id against it
  if (self.savedData.highestSeenId && rid <= self.savedData.highestSeenId) {
    self.log('info', 'Result [' + rid + '] skipped: Id lower than highest seen (' + self.savedData.highestSeenId + ').')
    return false
  }


  // If the trawler has a list of previously seen ids, compare this Id against that list
  if (self.savedData.seenIds && self.savedData.seenIds.indexOf(params.result.id) > -1) {
    self.log('info', 'Result [' + rid + '] skipped: Id seen before.')
    return false
  }

  return true
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
