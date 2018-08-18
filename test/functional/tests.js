'use strict'

var
  cfg        = require('config'),
  chai       = require('chai'),
  EmailNotification = require('email-notification'),
  fs         = require('fs'),
  gmailModel = require('gmail-model'),
  jsonFile   = require('jsonfile'),
  log4js     = require('log4js'),
  nock       = require('nock'),
  Q          = require('q'),
  main       = require('../../lib/main.js')

/*
 * Set up chai
 */
chai.should();

var timeout = (1000*45)

var twitterHost = 'https://api.twitter.com/1.1'
var twitterUri  = '/statuses/user_timeline.json'

/*
 * Logs
 */
log4js.configure(cfg.log.log4jsConfigs);

var log = log4js.getLogger(cfg.log.appName);
log.setLevel(cfg.log.level);


var d = new Date()
var d = d.getTime()
var recipientAddress = cfg.testEmailRecipient.emailAddress.replace('@', '+' + cfg.appName + '-test@')
cfg.reporter.notificationTo = recipientAddress

var tweetDataSF = jsonFile.readFileSync('./test/data/responseTweetsSecretFlying.json')
var tweetDataHP = jsonFile.readFileSync('./test/data/responseTweetsHolidayPirates.json')


/**
 * getNewEN
 *
 * @desc Create a new email-notification object
 *
 * @param {object=}  params -
 * @param {string=}  who    - Either "r"ecipient or "s"ender
 * @param {string}   gsc    - Gmail search criteria for the object
 * @param {callback} cb     - The callback that handles the response. cb(err)
 *
 */
function getNewEN (params) {

  var p = {
    gmailSearchCriteria: params.gsc,
    processedLabelName:  cfg.processedLabelName,
    metadataHeaders: ['From', 'To', 'Subject', 'Date'],
    format: 'metadata',
    retFields: ['id', 'labelIds', 'payload(headers)']
  }

  if (params.who == 'r') {
    p.gmail = cfg.testEmailRecipient.gmail
  } else {
    p.gmail = cfg.testEmailSender.gmail
  }

  return new EmailNotification(p)
}


/**
 * cleanup
 *
 * @desc Cleans up all sent and received emails and the label for the operation
 *
 * @param {object=}  params - Parameters for request (currently no params supported)
 * @param {callback} cb     - The callback that handles the response. cb(err)
 *
 */
function cleanup(params, cb) {

  var fn = 'cleanup'

  var gsc = "to:" + recipientAddress


  // Cleanup the report email received by the recipient
  var deferredEr  = Q.defer()
  var enRecipient = getNewEN ({who: 'r', gsc: 'is:inbox ' + gsc})

  log.info('%s: recipient: cleaning up...', fn)
  enRecipient.hasBeenReceived(null,function (err, hbr) {
    if (hbr) {
      enRecipient.trash(null,function (err) {
        if (err) { deferredEr.reject(err); return null }
        log.info('%s: recipient: cleaned.', fn)
        deferredEr.resolve()
      })
    } else {
        log.info('%s: recipient: nothing to clean.', fn)
        deferredEr.resolve()
    }
  })


  // Cleanup the report email sent by the sender
  var deferredEs = Q.defer()
  var enSender   = getNewEN ({who: 's', gsc: 'in:sent '  + gsc})

  log.info('%s: sender: cleaning up...', fn)
  enSender.hasBeenReceived(null,function (err, hbr) {
    if (hbr) {
      enSender.trash(null,function (err) {
        if (err) { deferredEs.reject(err); return null }
        log.info('%s: sender: cleaned.', fn)
        deferredEs.resolve()
      })
    } else {
        log.info('%s: sender: nothing to clean.', fn)
        deferredEs.resolve()
    }
  })

  // Delete the savedData file
  var deferredSD = Q.defer()
  log.info('%s: savedDataFile deleting...', fn)
  fs.unlink(cfg.savedDataFile, function (err) {
    if (err) { deferredSD.reject(err); return null }
    log.info('%s: savedDataFile deleted.', fn)
    deferredSD.resolve()
  })

  // Return the callback when all promises have resolved
  Q.allSettled([ deferredEr.promise, deferredEs.promise, deferredEs.promise ])
  .catch(function (e) {console.error(e)})
  .fin(function () {cb(null)})
}


/**
 * startScript
 *
 * @desc Triggers the script and adds a delay before completing to allow notification emails to go out
 *
 * @param {object=}  params                  - Parameters for request (currently unused)
 * @param {callback} cb                      - The callback that handles the response. cb(err)
 *
 */
function startScript(params, cb) {

  var fn = 'startScript'
  log.info('%s: pre-emptive cleanup', fn)

  Q.nfcall(cleanup,null)
  .then( function () {

    log.info('%s: start the script', fn)
    return Q.nfcall(main,null)
  })
  .then( function () {
    // Add an arbitrary delay to allow the report email to arrive
    log.info('%s: Pausing for emails', fn)

    var d = Q.defer()
    setTimeout(function () {
      d.resolve()
    } ,3000)
    return d.promise
  })
  .catch (function (e) {
    log.error('%s: Error running the script : %s', fn, e.toString())
  })
  .fin(cb)

}


/*
 * The actual tests
 */


describe('When trawlers returns results', function () {

  this.timeout(timeout)

  var nockSF, nockHP, tdSF, tdHP

  before(function (done) {

    tdSF = tweetDataSF.slice()
    tdHP = tweetDataHP.slice()

    var qsSF = { screen_name: "SecretFlying",   count: 5, trim_user: "true", exclude_replies: "true" }
    var qsHP = { screen_name: "HolidayPirates", count: 5, trim_user: "true", exclude_replies: "true" }
    nockSF = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)

    startScript(null, done)
  })



  it ('Sends a successful report', function(done) {

    // Get the report email
    var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress + ' (half price)'})
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(true)
      done()
    })

  })


   after( function (done) {
    nock.cleanAll()
    nockSF = null
    nockHP = null
    cleanup(null,done)
  })
})


describe('When only one trawler returns results', function () {

  this.timeout(timeout)

  var nockSF, nockHP, tdSF, tdHP, qsSF, qsHP

  before(function (done) {

    tdSF = []
    tdHP = tweetDataHP.slice()

    qsSF = { screen_name: "SecretFlying",   count: 5, trim_user: "true", exclude_replies: "true" }
    qsHP = { screen_name: "HolidayPirates", count: 5, trim_user: "true", exclude_replies: "true" }
    nockSF = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)

    startScript(null, done)
  })



  it ('Sends a successful report with the results received by the remaining trawlers', function(done) {

    // Get the report email
    var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress + ' (@HolidayPirates-Twitter)'})
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(true)
      done()
    })

  })

  it ('Sends a since_id on the subsequent call for the one that returned the result', function(done) {

    qsHP.since_id = 1001102141761650700

    var nockHP2 = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,[])

    main(null, function () {
      nockHP2.isDone().should.equal(true)
      done()
    })

  })


  after( function (done) {
    nock.cleanAll()
    nockSF = null
    nockHP = null
    cleanup(null,done)
  })
})



describe('When no trawlers returns results', function () {

  this.timeout(timeout)

  var nockSF, nockHP, tdSF, tdHP

  before(function (done) {

    tdSF = []
    tdHP = []

    var qsSF = { screen_name: "SecretFlying",   count: 5, trim_user: "true", exclude_replies: "true" }
    var qsHP = { screen_name: "HolidayPirates", count: 5, trim_user: "true", exclude_replies: "true" }
    nockSF = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)

    startScript(null, done)
  })



  it ('Does not send any kind of report', function(done) {
    // Get the report email
    var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress})
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(false)
      done()
    })
  })

   after( function (done) {
    nock.cleanAll()
    nockSF = null
    nockHP = null
    cleanup(null,done)
  })
})
