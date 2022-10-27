import { cbFunction } from '../interfaces/iGeneral';
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


type trawlerResult = {
  id: number;
  [x: string]: any;
}

type savedData  = {
  highestSeenId?: number,
  seenIds?: number[]
  results: trawlerResult[]  
}


/**
 * SiteTrawler model constructor.
 * @param {object}      params                 - Params to be passed in
 * @param {maxResults=} params.maxResults      - Max number of results to be returned from the site being trawled.
 * @param {object=}     params.subClassSetup   - The setup object originally sent to the subclass
 * @param {regex[]}     params.regexMatches    - A regular expression to run against the result. If provided, only result descriptions matching this regex will be returned. Optional arg (optional)
 * @param {string}      params.regexMatchField - The result field against which to match the regex (optional)
 * @param {object}      params.rollCall
 * @param {string[]}    params.rollCall.name   - Names to check for attendance
 * @param {string}      params.rollCall.attendeeFieldToTest - The name of the field in the results to check against the rollCall names
 * @param {boolean}     params.saveResults
 * @param {object}      params.spreadsheet
 * @param {string}      params.spreadsheet.id  - ID of the google spreadsheet
 * @param {string}      params.spreadsheet.subSheetName - Name of the subsheet
 * @constructor
 */
export abstract class aSiteTrawler {

  private id: string;
  private dataToSave: savedData = {results: []};
  private dataToSaveToSpreadsheet: Object[] =[];
  private maxResults: number | null =null;
  private results: trawlerResult[] =[];
  private recordAllSeenIds: boolean =false;
  private recordHighestSeenId: boolean =false;
  private regexMatches: RegExp[] =[];
  private regexMatchField: string | null= null;
  private rollCall: string[] = [];
  protected savedData: savedData = {results: []};
  private saveResults: boolean =false;
  private spreadsheet : {
    id: string
    subSheetName: string
  } | null =null


  constructor (params: {
    recordAllSeenIds?: boolean,
    recordHighestSeenId?: boolean,
    regexMatchField: string,
    saveResults?: boolean,
    id: string,
    maxResults?: number,
    regexMatches: {
      pattern: RegExp,
      flags: string
    }[],
    rollCall?: string[],
    spreadsheet? : {
      id: string
      subSheetName: string
    } | null
  }) {


    this.id = params.id

    if (params.regexMatches && params.regexMatchField) {
      this.regexMatchField = params.regexMatchField

      this.regexMatches = params.regexMatches.map(({pattern, flags}) => {
        return new RegExp(pattern, flags)
      })
    }

    if (params.maxResults)           this.maxResults          = params.maxResults;
    if (params.recordHighestSeenId)  this.recordHighestSeenId = params.recordHighestSeenId;
    if (params.recordAllSeenIds)     this.recordAllSeenIds    = params.recordAllSeenIds   ;
    if (params.saveResults)          this.saveResults         = params.saveResults        ;
    if (params.spreadsheet)          this.spreadsheet         = params.spreadsheet;
    if (params.rollCall)             this.rollCall            = params.rollCall;

    this.log("info", "initialized.")
  }

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
  log(level: string, msg: string): void {
      log[level]("[%s] - %s", this.id, msg)
  }


  /**
   * SiteTrawler.getDataToSave
   *
   * @desc Get the data to be saved to file for the next run
   *
   * @returns {object} dataToSave -
   */
  getDataToSave(): savedData {
    return this.dataToSave
  }

  /**
   * SiteTrawler.getDataToSaveToSpreadsheet
   *
   * @desc Get the data to be saved to spreadsheet
   *
   * @returns {object[]} dataToSave -
   */
  getDataToSaveToSpreadsheet(): Object[] {
    return this.dataToSaveToSpreadsheet
  }

  /**
   * SiteTrawler.getResults
   *
   * @desc Get the next x results from this trawler
   *
   * @alias SiteTrawler.getResults
   *
   * @returns  {Object[]}
   */
  async getResults(): Promise<Object[]> {

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
  abstract getResultsString(): string


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
  abstract loadResults(params: null, cb :cbFunction)

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
  resultPassesCommonFilters(params: {
    result: trawlerResult
  }): boolean {

    var self = this

    var rid = params.result.id

    self.log('debug', 'Filtering result [' + rid + '] - ' + JSON.stringify(params.result))


    // Run regex checks

    var hasPassed = false

    if (self.regexMatches
      && self.regexMatchField
      && params.result.hasOwnProperty(self.regexMatchField)
      && typeof (params.result[self.regexMatchField]) == "string"
    ) {

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
  async resultPassesCustomFilters (params: {result: trawlerResult}): Promise<boolean> {
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
  async applyResultTransformation (params: {result: trawlerResult}): Promise<trawlerResult> {
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
  setSavedData(params: {
    savedData: savedData
  }): void {
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
  getRollCallValues (params: {
    names: string[],
    attendeeFieldToTest: string,
    valueForAbsentees: any,
    attendees: trawlerResult[]
  }): trawlerResult[] {
    
    const {names, attendeeFieldToTest, valueForAbsentees, attendees} = params

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
}