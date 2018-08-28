/**
 * This object represents a Gumtree searcher. It gets the tweet timeline for a particular user and searches for content I'm interested in.
 */


var cheerio     = require('cheerio');
var cfg         = require('config');
var fs          = require('fs');
var request     = require('request');
var SiteTrawler = require('./SiteTrawler.js');



/**
 * Basic request params for all calls to Gumtree
 */
var gumtreeRequestDefaults = {
  baseUrl : 'https://www.gumtree.com'
}

if (cfg.has('connectionTimeout')) { gumtreeRequestDefaults.timeout = cfg.connectionTimeout }


var gumtreeRequest = request.defaults(gumtreeRequestDefaults)



class GumtreeTrawler extends SiteTrawler {

  /**
   * GumtreeTrawler model constructor.
   * @param {object}  params                 - Params to be passed in
   * @param {string}  params.id              - English name for the trawler instance. Will be used as a unique identifier.
   * @param {number}  params.maxResults      - Max number of results to be returned from the site being trawled. (optional)
   * @param {object}  params.gtQuery         - Search query filters to be sent to gumtree.
   * @param {regex[]} params.regexMatches    - A regular expression to run against the result. If provided, only result descriptions matching this regex will be returned. Optional arg
   * @param {regex[]} params.regexMatchField - The field against which to run the regex
   * @constructor
   */
  constructor(params) {

    var superArgs = {}
    superArgs.regexMatchField = "title"
    superArgs.subClassSetup = params

    super(superArgs)

    this.gtQuery = params.gtQuery
  }

}

var method = GumtreeTrawler.prototype


/**
 * GumtreeTrawler.getResultsString
 *
 * @desc Get an English string describing the contents of the results. This function needs to be overridden by each trawler subclass.
 *
 * @alias GumtreeTrawler.getResultString
 *
 */
method.getResultsString = function () {

  var ret = ""

  for (var i = 0; i < this.results.length; i++) {

    var result = this.results[i]
    ret +=  "<p>"
    ret +=  "<br>" + result.title
    ret +=  "<br>" + result.location
    ret +=  "<br>" + result.url
    ret +=  "<br>£" + result.price
  }

  this.log('info', ret)

  return ret
}


/**
 * GumtreeTrawler.loadResults
 *
 * @desc Get a set of gumtree results
 *
 * @alias GumtreeTrawler.loadResults
 *
 * @param  {object} params     - Parameters for request (currently unused)
 * @param  {callback} callback - The callback that handles the response. Returns callback(err, listing[])
 *                               where a listing is an object of the form {
 *                                 price: price of the item
 *                                 title: of the item
 *                                 location: of the item
 *                                 url: of the item
 *                               }
 */
method.loadResults = function (params,cb) {

  var self = this

  self.log('info', 'Getting listings...')

  gumtreeRequest.get({
    uri: 'search?' + self.gtQuery
  }, function (err, resp, body) {

    var errMsg = ""

    if (err) {
      errMsg = 'Bad response: ' + err
    } else if (resp.statusCode > 200) {
      var errMsg = 'Unexpected response: (' + resp.statusCode + ') ' + JSON.stringify(resp.body)
    }

    if (errMsg != "") {
      self.log('error', errMsg)
      cb(errMsg)
      return null
    }


    // Extract the right listings from the html body

    var $ = cheerio.load(body)
    var listings = $("a.listing-link")

    var results = []
    var newSeenIds = []

    // The listings come in in descending chronological order so start at the end and come back down to find the latest
    for (var i = (listings.length - 1); i >= 0; i--) {

      var result = {}
      var listing = listings[i]

      result.url = "https://www.gumtree.com" + $(listing).attr("href").trim()

      // Filter out listings we've seen before
      if (self.savedData.seenIds && self.savedData.seenIds.indexOf(result.url) > -1) {
        self.log('info', 'Skipping seen listing: ' + result.url)
        continue;
      }

      var listingContent = $(listing).children(".listing-content")

      result.price    = listingContent.children(".listing-price").children("meta[itemprop='price']").attr("content")

      // Filter out adverts
      if (!result.price || result.price == "") continue;


      result.title    = listingContent.children(".listing-title").text().trim()
      result.location = listingContent.children(".listing-location").text().trim().replace("Distance from search location: ", "")


      var add = false

      if (self.resultPassesCommonFilters({result: result})) { add = true }

      if (add) {
        self.results.push(result)
        newSeenIds.push(result.url)
        if (self.maxResults && newSeenIds.length >= self.maxResults) break;

      } else {
        self.log('info','Not matched')
      }

    }


    if (self.results.length == 0) {
      self.log('info', 'No listings.')
      cb(null,[])
      return null
    }

    self.log('info', 'Got ' + self.results.length + ' listings.')

    // Save the new seen ids so we're able to filter on the next run
    if (!self.savedData.seenIds) { self.savedData.seenIds = [] }
    self.dataToSave.seenIds = self.savedData.seenIds.concat(newSeenIds)

    cb(null,self.results)

  })
}


module.exports = GumtreeTrawler
