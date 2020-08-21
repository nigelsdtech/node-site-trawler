/**
 * This object represents an eWeLink searcher. It gets all Sonoff products for a particular user and searches for content I'm interested in.
 */

var ewelinkApi  = require('ewelink-api');
var SiteTrawler = require('./SiteTrawler.js');



/**
 * Module defaults
 */


class EWeLinkTrawler extends SiteTrawler {

  /**
   * EWeLinkTrawler model constructor.
   * @param {object}   params               - Params to be passed in
   * @param {boolean}  params.alwaysReportIfOn - Optional arg. Default False. If set, it will report when the device is on.
   * @param {number}   params.batteryFilterThreshold - Optional arg. If set, any item with battery above this amount will be filtered out.
   * @param {string}   params.username      - eWeLink username
   * @param {string}   params.id            - English name for the trawler instance. Will be used as a unique identifier.
   * @param {string}   params.password      - eWeLink password
   * @param {regex[]}  params.regexMatches  - A regular expression to run against the found device. If provided, only devices matching this regex will be returned. Optional arg
   * @param {string}   params.region        - eWeLink region
   * @constructor
   */
  constructor(params) {

    var superArgs = {}
    superArgs.regexMatchField     = "name"
    superArgs.subClassSetup       = params

    super(superArgs)

    this.username = params.username
    this.password = params.password
    this.region   = params.region
    this.batteryFilterThreshold = params.batteryFilterThreshold;
    this.alwaysReportIfOn = params.alwaysReportIfOn | false
  }

}

var method = EWeLinkTrawler.prototype


/**
 * EWeLinkTrawler.getResultsString
 *
 * @desc Get an English string describing the contents of the results. This function needs to be overridden by each trawler subclass.
 *
 * @alias EWeLinkTrawler.getResultString
 *
 */
method.getResultsString = function () {

  const ret = this.results.reduce( (accumulator, r) => {
    return `${accumulator}${r.name}: Battery ${r.battery}, Status ${r.status}<p>`
  }, "")

  this.log('info', ret)

  return ret

}


/**
 * EWeLinkTrawler.loadResults
 *
 * @desc Get the devices
 *
 * @alias EWeLinkTrawler.loadResults
 *
 * @param  {object} params     - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, tweets[])
 *                               where tweets are objects of the form {
 *                                 id: twitter Id
 *                                 content: the text of the tweet
 *                               }
 */
method.loadResults = async function (params,cb) {

  await this.loadResultsAsync(params) 
  cb(null)

}


method.loadResultsAsync = async function (params) {

  const self = this
  self.log('info', `Getting sonoff devices for user ${self.id}`)

   const connection = new ewelinkApi({
    email: self.username,
    password: self.password,
    region: self.region,
  });

  /* get all devices */
  const devices = await connection.getDevices();

  if (devices.error) {
    self.log('error', `eWeLink returned error ${devices.error}: ${devices.msg}`)
    throw new Error(`eWeLink error: ${devices.msg}`)
  }
  self.log('debug', devices)

  self.results = devices
    .map ( (d) => {
      return {
        name: d.name,
        battery: d.params.battery,
        id: d.deviceid,
        status: d.params.switch,
        lastUpdate: d.params.lastUpdateTime
      }
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
method.resultPassesCustomFilters = function (params) {

  const r = params.result

  this.log('info', `Custom filtering result [${r.id}] ${JSON.stringify(r)}`)

  if (this.alwaysReportIfOn && r.status == "on") return true;
  
  if (this.batteryFilterThreshold && r.battery > this.batteryFilterThreshold) return false;

  return true

}


module.exports = EWeLinkTrawler
