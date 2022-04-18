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

    this.log("info", "Initializing eWeLinkTrawler base class")
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
method.loadResults = async function (params,cb) {

  const self = this

  const results = await self.eWeLinkTrawler.getResults()

  const d = new Date()
  const now = d.getTime()

  self.eWeLinkTrawler.results.forEach((result) => {
    const r = Object.assign({}, result, {lastUpdateTime: now})
    self.results.push(r)
  })

  cb()

}



/**
 * EWeLinkTrawler.applyResultTransformation
 *
 * @desc Transform the result to save based on various conditions
 *
 * @alias EWeLink.applyResultTransformation
 *
 * @param   {object}   params         - Parameters for request
 * @param   {object}   params.result  - Information about the sonoff device.
 * @returns {object}   a result to be saved
 *
 */
 method.applyResultTransformation = async function (params) {

  const r = params.result

  const savedDevices = this.savedData.results

  if (savedDevices.length == 0) {return r}
  const savedDeviceData = savedDevices.find( (device) => {return (device.name == r.name)})
  if (!savedDeviceData) {return r}

  if (r.switchStatus == "off") {return r}

  const savedDeviceSwitchStatus = savedDeviceData.switchStatus

  if (savedDeviceSwitchStatus == "off") {return r}

  if (this.turnOffAfterElapsedMilliseconds == -1) {return r}

  const d = new Date()
  const now = d.getTime()

  const elapsedTimeSinceTheDeviceWasSwitchedOn = (now - savedDeviceData.lastUpdateTime)

  // If it is below the "turn off" threshold
  if (elapsedTimeSinceTheDeviceWasSwitchedOn < this.turnOffAfterElapsedMilliseconds) {
    const ret = Object.assign({}, r, {lastUpdateTime: savedDeviceData.lastUpdateTime})
    return ret
  }

  this.log('info', `${r.name} has been ${r.switchStatus} since ${r.lastUpdateTime}. Turning it off...`)

  // Call eWeLink to turn it off
  console.log(`==========SteveFlag 20`)
  const response = await this.eWeLinkConnection.setDevicePowerState(r.id, 'off')
  .catch((e) => {
    this.log('error', `Could not turn device off: ${e}`)
    throw new Error (`Could not turn device off: ${e}`)
  })
  console.log(`==========SteveFlag 30`)

  const ret = Object.assign({}, r, {
    lastUpdateTime: now,
    switchStatus: "off"
  })

  return ret

}

method.resultPassesCustomFiltersBackup = async function (params) {

  const r = params.result

  const savedDevices = this.savedData.results

  // If there is no known state of this device then we want it to be saved
  const deviceFromSavedData = savedDevices.find((device) => {return (device.name == r.name)})

  if (typeof deviceFromSavedData == "undefined") return true;

  
  // For tests where it depends on how long the device has been on
  if (this.turnOffAfterElapsedMilliseconds != -1) {


    // Record this as having been switched off the last time we checked
    if (r.switchStatus == "off") {return true} 

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
