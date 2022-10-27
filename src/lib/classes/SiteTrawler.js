/**
 * This interface class represents a website trawler
 */


var cfg     = require('config');
var log4js  = require('log4js');
const {promisify} = require('util');

/*
 * Logs
 */
log4js.configure(cfg.log.log4jsConfigs);

var log = log4js.getLogger(cfg.log.appName);
log.setLevel(cfg.log.level);





/**
 * SiteTrawler model constructor.
 * @param {object}      params                 - Params to be passed in
 * @param {number}      params.maxResults      - Max number of results to be returned from the site being trawled.
 * @param {boolean}     params.recordAllSeenIds  - Whether or not to record all seen Ids (optional)
 * @param {boolean}     params.recordHighestSeenId  - Whether or not to record the highest seen Id (optional)
 * @param {RegExp[]}    params.regexMatches    - A regular expression to run against the result. If provided, only result descriptions matching this regex will be returned. Optional arg (optional)
 * @param {string}      params.regexMatchField - The result field against which to match the regex (optional) 
 * @param {object}      params.rollCall
 * @param {string[]}    params.rollCall.name   - Names to check for attendance
 * @param {string}      params.rollCall.attendeeFieldToTest - The name of the field in the results to check against the rollCall names
 * @param {boolean}     params.saveResults
 * @param {object}      params.spreadsheet
 * @param {string}      params.spreadsheet.id  - ID of the google spreadsheet
 * @param {string}      params.spreadsheet.subSheetName - Name of the subsheet
 * @param {object=}     params.subClassSetup   - The setup object originally sent to the subclass
 * @constructor
 */
function SiteTrawler (params) {

  this.id = params.subClassSetup.id

  if (params.subClassSetup.maxResults) { this.maxResults = params.subClassSetup.maxResults }

  // To be set by the getResults functions
  this.results = []

  this.savedData = {}
  this.dataToSave = {}
  this.dataToSaveToSpreadsheet = []

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
  this.saveResults         = params.saveResults

  this.spreadsheet = params.subClassSetup.spreadsheet
  this.rollCall = params.subClassSetup.rollCall

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
 * @param  {string} msg   - Log message
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
 * SiteTrawler.getDataToSaveToSpreadsheet
 *
 * @desc Get the data to be saved to spreadsheet
 *
 * @param  {object}   params    - Parameters for request (currently unused)
 *
 * @returns {object[] | null} dataToSave -
 */
method.getDataToSaveToSpreadsheet = function (params) {
  return null
}

/**
 * SiteTrawler.getResults
 *
 * @desc Get the next x results from this trawler
 *
 * @alias SiteTrawler.getResults
 *
 * @param  {object}   params   - Parameters for request (currently unused)
 */
method.getResults = async function (params) {

  const self = this

  self.results  = []

  const loadResults = promisify(self.loadResults).bind(self)
  
  await loadResults(null)
  .catch((e) => {
    throw new Error(`Failed to load results: ${e}`)
  })

  self.log('info', 'Got ' + self.results.length + ' results.')

  const rhsi = self.recordHighestSeenId

  // Tracking the highest seen id  
  const oldHighestSeenId = (() => {
    if (!rhsi) return null;
    if (!self.savedData.highestSeenId) return null
    return self.savedData.highestSeenId;
  })() 

  // Tracking all seen Ids
  const rasi = self.recordAllSeenIds
  const oldSeenIds = (self.savedData.seenIds)? self.savedData.seenIds : [];


  const parseResults = async (accumulator) => {

    const {rawResults, highestSeenId, seenIds, filteredResults} = accumulator

    if (rawResults.length == 0) { return {highestSeenId, seenIds,filteredResults} }

    const [result, ...nextResults] = rawResults

    if (filteredResults.length == self.maxResults) { return {highestSeenId,seenIds,filteredResults} }

    // First record the highest seen Id
    const newHighestSeenId = (() => {
      if (!rhsi || result.id < highestSeenId) return highestSeenId
      return result.id
    })()

    // Apply various filters to the returned results
    const test1 = self.resultPassesCommonFilters({result: result})
    const test2 = await (() => {
      if (!test1) return test1

      return self.resultPassesCustomFilters({result: result})
      .catch((err) => {
        const msg = `Error while running custom filter for ${result.id}: ${err}`
        self.log('error', msg)
      })
    })()

    const isQualified = (test1 && test2)

    // Record it as a newSeenId
    const newSeenIds = (() => {
      if (!rasi) return []
      if (isQualified) return seenIds.concat(result.id);
      return seenIds
    })()

    // Apply custom transformations
    const transformedResult = (isQualified)? await self.applyResultTransformation({result}) : null;

    return parseResults ({
      rawResults: nextResults,
      highestSeenId: newHighestSeenId,
      seenIds: newSeenIds,
      filteredResults: (isQualified)? filteredResults.concat(transformedResult) : filteredResults
    })

  }

  const {highestSeenId,seenIds: newSeenIds,filteredResults} = await parseResults({
    rawResults: self.results,
    highestSeenId: oldHighestSeenId,
    seenIds: [],
    filteredResults: []
  })


  // Save the highestSeenId
  if (rhsi) {
    self.dataToSave.highestSeenId = highestSeenId
  }

  // Save all the seen IDs
  if (rasi && newSeenIds.length > 0) {
    self.dataToSave.seenIds = oldSeenIds.concat(newSeenIds)
  }

  // Save all the results we wanted
  if (this.saveResults) {
    self.dataToSave.results = filteredResults
  }

  // Filtering logic
  self.results = filteredResults;
  self.log('info', 'Final results in order - ' + JSON.stringify(self.results))

  return self.results
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

  self.log('debug', 'Filtering result [' + rid + '] - ' + JSON.stringify(params.result))


  // Run regex checks

  var hasPassed = false

    if (self.regexMatches) {

    for (var i = 0; i < self.regexMatches.length; i++) {

      var re = self.regexMatches[i]

      if (params.result[self.regexMatchField].match(re)) {
        hasPassed = true;
        self.log('debug','Result [' + rid + '] matched regex - ' + re.toString() + ' - ' + params.result[self.regexMatchField])
        break;
      }
    }

  } else {
    hasPassed = true
  }

  if (!hasPassed) {
    self.log('debug','Result [' + rid + '] skipped: Failed regex matches.')
    return false
  }


  // If the trawler has a concept of a highestSeenId, compare this Id against it
  if (self.savedData.highestSeenId && rid <= self.savedData.highestSeenId) {
    self.log('debug', 'Result [' + rid + '] skipped: Id lower than highest seen (' + self.savedData.highestSeenId + ').')
    return false
  }


  // If the trawler has a list of previously seen ids, compare this Id against that list
  if (self.savedData.seenIds && self.savedData.seenIds.indexOf(rid) > -1) {
    self.log('debug', 'Result [' + rid + '] skipped: Id seen before.')
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
method.resultPassesCustomFilters = async function (params) {
  // Add your own custom filters in the subclass
  return true
}

/**
 * SiteTrawler.applyResultTransformation
 *
 * @desc Apply transformations to a particular result with the intention of saving it in the modified form
 *
 * @alias SiteTrawler.applyResultTransformation
 *
 * @param   {object}   params         - Parameters for request
 * @param   {object}   params.result  - Information about the result. The specifics of the result can be changed per subclass
 * @returns {result}  a modified version of the passed-in result
 *
 */
method.applyResultTransformation = async function (params) {
  // Add your own custom filters in the subclass
  return params.result
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


/**
 * SiteTrawler.getRollCallValues
 *
 * @desc For a given set of values, check that each one is represented in the result set
 *
 * @param  {object}   params                        - Parameters for request
 * @param  {string[]} params.names                  - The list of values to check for
 * @param  {any}      params.valueForAbsentees      - Set this value for absentees
 * @param  {object[]} params.attendees              - List of values to be inspected
 * @param  {string}   params.attendeeFieldToTest    - the key of the json field (of the result) for which the value will be checked for attendance
 *
 * @returns {object}  Result set ordered in the order in which attendees were passed in
 */
method.getRollCallValues = function ({
  names,
  attendeeFieldToTest,
  valueForAbsentees = {},
  attendees
}) {
  
  const ret = names.reduce( ([inputResults, outputResults], name) => {

    // Does this attendee exist in the inputResults?
    const foundIdx = inputResults.findIndex( (inputResult) => {
      return (name == inputResult[attendeeFieldToTest])
    })

    
    const [attendeeValue, isPresent] = (() => {
    
      if (foundIdx > -1) return [inputResults[foundIdx], true]
      
      const absenteeValue = {}
      absenteeValue[attendeeFieldToTest] = name

      return [Object.assign({}, absenteeValue, valueForAbsentees), false]
    })()

    // If the roll name was found
    const newOutputResults = outputResults.concat(attendeeValue)
    if (isPresent) inputResults.splice(foundIdx,1);
    return [inputResults, newOutputResults]

    
  }, [attendees, []])

  return ret[1]
}


module.exports = SiteTrawler
