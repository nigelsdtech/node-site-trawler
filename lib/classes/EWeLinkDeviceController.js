/**
 * This object represents an eWeLink searcher. It gets all Sonoff products for a particular user and searches for content I'm interested in.
 */

const ewelinkApi  = require('ewelink-api'),
  SiteTrawler = require('./SiteTrawler.js'),
  eWeLinkTrawler = require('./EWeLinkTrawler.js')



/**
 * Module defaults
 */


class EWeLinkDeviceController extends SiteTrawler {

  /**
   * EWeLinkTrawler model constructor.
   * @param {object}   params               - Params to be passed in
   * @param {string}   params.username      - eWeLink username
   * @param {string}   params.id            - English name for the trawler instance. Will be used as a unique identifier.
   * @param {string}   params.password      - eWeLink password
   * @param {regex[]}  params.regexMatches  - A regular expression to run against the found device. If provided, only devices matching this regex will be returned. Optional arg
   * @param {string}   params.region        - eWeLink region
   * @param {number}   params.turnOffAfterElapsedMilliseconds - Optional arg. If this switch state was set to "on" more than x ms ago, turn it off.
   * @constructor
   */
  constructor(params) {

    const superArgs = {
      regexMatchField: "name",
      saveResults: true,
      subClassSetup: params
    }

    super(superArgs)

    this.eWeLinkTrawler = new eWeLinkTrawler({
      username: params.username,
      id: params.id,
      password: params.password,
      regexMatches: params.regexMatches,
      region: params.region
    })

    this.eWeLinkConnection = new ewelinkApi({
      email: params.username,
      password: params.password,
      region: params.region
    });

    this.turnOffAfterElapsedMilliseconds = params.turnOffAfterElapsedMilliseconds || -1

    this.savedData.results = []
  }

}

const method = EWeLinkDeviceController.prototype


/**
 * EWeLinkTrawler.getResultsString
 *
 * @desc Get an English string describing the contents of the results. This function needs to be overridden by each trawler subclass.
 *
 * @alias EWeLinkDeviceController.getResultString
 *
 */
method.getResultsString = function () {

  return ""

}


/**
 * EWeLinkDeviceController.loadResults
 *
 * @desc Get the devices
 *
 * @alias EWeLinkDeviceController.loadResults
 *
 * @param  {object} params     - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, tweets[])
 *                               where tweets are objects of the form {
 *                                 id: twitter Id
 *                                 content: the text of the tweet
 *                               }
 */
method.loadResults = function (params,cb) {

  const self = this
  self.eWeLinkTrawler.loadResults(params, () => {

    const d = new Date()
    const now = d.getTime()
    self.eWeLinkTrawler.results.forEach((result) => {
      const r = Object.assign({}, result, {lastUpdateTime: now})
      self.results.push(r)
    })

    cb()
  })


}



/**
 * EWeLinkTrawler.resultPassesCustomFilters
 *
 * @desc Apply a set of filters specific to the EWeLink to see if the result is suitable.
 *
 * @alias EWeLink.resultPassesCustomFilters
 *
 * @param   {object}   params         - Parameters for request
 * @param   {object}   params.result  - Information about the sonoff device.
 * @returns {boolean}  true if the result is deemed suitable
 *
 */
method.resultPassesCustomFilters = async function (params) {

  const r = params.result

  const savedDevices = this.savedData.results

  // If there is no known state of this device then we want it to be saved
  const deviceFromSavedData = savedDevices.find((device) => {return (device.name == r.name)})

  if (typeof deviceFromSavedData == "undefined") return true;

  
  // For tests where it depends on how long the device has been on
  if (this.turnOffAfterElapsedMilliseconds != -1) {


    if (r.switchStatus == "off") {

      // If there is a record, and that record says it was last known to be off, then abort
      if (deviceFromSavedData.switchStatus == "off") {
        return false;
      } else {
        // The last time we saw the device, we believed it was on. Record the fact that it is now off without actually calling eWeLink.
        return true
      }

    } 

    // If we got here, it means the switch is due to be turned off.

    // Expect this to be a unix timestamp
    const turnedOnTime = deviceFromSavedData.lastUpdateTime

    const d = new Date()
    const now = d.getTime()

    const elapsedTime = now - turnedOnTime

    // Bail if we're still under the elapsed time
    if (elapsedTime < this.turnOffAfterElapsedMilliseconds) return false;

    this.log('info', `${r.name} has been ${r.switchStatus} since ${turnedOnTime}. Turning it off...`)
    // Call eWeLink to turn it off
    const response = await this.eWeLinkConnection.setDevicePowerState(r.id, 'off');

    if (response.hasOwnProperty("status") && response.status != "ok") {
      const errMsg = `Error changing device status for ${this.savedData.name} (${this.savedData.id}): ${JSON.stringify(response,null,"\t")}`
      this.log('error', errMsg)
      throw new Error(errMsg)
    }

    return true
  }

  return true

}


/**
 * EWeLinkTrawler.getDataToSaveToSpreadsheet
 *
 * @desc Get the data to be saved to spreadsheet
 *
 * @returns {any[]} dataToSave -
 */
method.getDataToSaveToSpreadsheet = function () {
  
  const rollCallValues = this.getRollCallValues({
    names: this.rollCall.names,
    attendeeFieldToTest: this.rollCall.attendeeFieldToTest,
    valueForAbsentees: {
      battery: null
    },
    attendees: this.results
  })

  if (rollCallValues.length == 0) return null;

  const d = new Date().toISOString().replace('T', ' ').split('.')[0]
  return rollCallValues.reduce( (accumulator, rcv) => {
    return accumulator.concat(rcv.battery)
  }, [d])
}

module.exports = EWeLinkDeviceController
