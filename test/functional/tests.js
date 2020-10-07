'use strict'

var
  cfg        = require('config'),
  chai       = require('chai'),
  EmailNotification = require('email-notification'),
  ewelinkApi = require('ewelink-api'),
  fs         = require('fs'),
  jsonFile   = require('jsonfile'),
  log4js     = require('log4js'),
  nock       = require('nock'),
  sinon      = require('sinon'),
  Q          = require('q'),
  main       = require('../../lib/main.js')

/*
 * Set up chai
 */
chai.should();

var timeout = (1000*20)

var twitterHost = 'https://api.twitter.com/1.1'
var twitterUri  = '/statuses/user_timeline.json'

var gumtreeHost = "https://www.gumtree.com"
var gumtreeUri  = "/search"

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

const
  tweetDataSF = jsonFile.readFileSync('./test/data/responseTweetsSecretFlying.json'),
  tweetDataHP = jsonFile.readFileSync('./test/data/responseTweetsHolidayPirates.json'),
  dataGumtree = fs.readFileSync('./test/data/gumtree/results_1.html'),
  dataEWeLink = jsonFile.readFileSync('./test/data/ewelink/responseSonoff.json');


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
 * @param {object=}   params      - Parameters for request (optional)
 * @param {string[]=} cleanupJobs - If params.cleanupJobs was passed in then we only use the specific jobs that were set. See opts for list of possible values
 * @param {callback}  cb          - The callback that handles the response. cb(err)
 *
 */
function cleanup(params, cb) {

  var fn = 'cleanup'

  var opts = {
    recipientInbox: true,
    senderInbox: true,
    savedDataFile: true
  }

  // If params.cleanupJobs was passed in then we only use the specific jobs that were set
  if (params && params.cleanupJobs) {

    var cj = params.cleanupJobs
    var jobs = ["recipientInbox", "senderInbox", "savedDataFile"]

    jobs.forEach(function (j) {
      opts[j] = (cj.indexOf(j) > -1 )? true : false;
    })
  }


  var gsc = "to:" + recipientAddress

  var jobs = []

  if (opts.recipientInbox) {
    // Cleanup the report email received by the recipient
    var deferredEr  = Q.defer()
    var enRecipient = getNewEN ({who: 'r', gsc: 'is:inbox ' + gsc})

    jobs.push(deferredEr.promise)

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
  }

  if (opts.senderInbox) {
    // Cleanup the report email sent by the sender
    var deferredEs = Q.defer()
    var enSender   = getNewEN ({who: 's', gsc: 'in:sent '  + gsc})

    jobs.push(deferredEs.promise)

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
  }

  if (opts.savedDataFile) {
    // Delete the savedData file
    var deferredSD = Q.defer()
    jobs.push(deferredSD.promise)

    log.info('%s: savedDataFile deleting...', fn)
    fs.unlink(cfg.savedDataFile, function (err) {
      if (err) { deferredSD.reject(err); return null }
      log.info('%s: savedDataFile deleted.', fn)
      deferredSD.resolve()
    })
  }

  // Return the callback when all promises have resolved
  Q.allSettled(jobs).catch(log.error).fin(cb)
}


/**
 * startScript
 *
 * @desc Triggers the script and adds a delay before completing to allow notification emails to go out
 *
 * @param {object=}   params             - Parameters for request (optional)
 * @param {string[]=} params.cleanupJobs - If params.cleanupJobs was passed in then we only run the specific jobs that were set. See opts for list of possible values (optional)
 * @param {callback}  cb                 - The callback that handles the response. cb(err)
 *
 */
function startScript(params, cb) {

  var fn = 'startScript'
  log.info('%s: pre-emptive cleanup', fn)

  var cleanupArgs = {}
  if (params && params.cleanupJobs) { cleanupArgs.cleanupJobs = params.cleanupJobs }

  Q.nfcall(cleanup,cleanupArgs)
  .then( function () {

    log.info('%s: start the script', fn)
    return main()
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

  var nockSF, nockHP, nockGT,
    nockSF2, nockHP2,
    stubEW,
    qsSF, qsHP, qsGT,
    tdSF, tdHP, tdGT, tdEW

  var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress + ' (half price)'})

  before(function (done) {

    tdSF = tweetDataSF.slice()
    tdHP = tweetDataHP.slice()
    tdGT = dataGumtree
    tdEW = dataEWeLink

    qsSF = { screen_name: "SecretFlying",   count: 5, trim_user: "true", exclude_replies: "true" }
    qsHP = { screen_name: "HolidayPirates", count: 5, trim_user: "true", exclude_replies: "true" }
    qsGT = { sort: "date", q: "microwave" }

    nockSF = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)
    nockGT = nock(gumtreeHost)          .get(gumtreeUri).query(qsGT).reply(200,tdGT)

    stubEW = sinon.stub(ewelinkApi.prototype,"getDevices").resolves(tdEW)

    qsSF.since_id = 1001102141761650689
    qsHP.since_id = 1001102141761650700

    nockSF2 = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP2 = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)

    startScript(null, done)
  })



  it('Sends a successful report', function(done) {

    // Get the report email
    er.flushCache()
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(true)
      done()
    })

  })

  it('Doesn\'t send a report if a subsequent call yields no results', function (done) {

    nockGT = nock(gumtreeHost).get(gumtreeUri).query(qsGT).reply(200,tdGT)
    stubEW.restore()
    stubEW = sinon.stub(ewelinkApi.prototype,"getDevices").resolves([])

    startScript({cleanupJobs: ["recipientInbox"]}, function () {

      nockHP2.isDone().should.equal(true)
      nockSF2.isDone().should.equal(true)

      er.flushCache()
      er.hasBeenReceived(null, function (err,hbr) {
        chai.expect(err).to.not.exist
        hbr.should.equal(false)
        stubEW.restore()
        stubEW = sinon.stub(ewelinkApi.prototype,"getDevices").resolves(tdEW)
        done()
      })
    })
  })

  it('Sends a report only containing additional results if a subsequent call yields a new one', function (done) {

    var tdGT2 = fs.readFileSync('./test/data/gumtree/results_1.1.html')
    nock(gumtreeHost).log(console.log).get(gumtreeUri).query(qsGT).reply(200,tdGT2)

    startScript({cleanupJobs: ["recipientInbox"]}, function () {

      var er2 = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress + ' (bogus new york) -(Morphy Richards)'})

      // Look for another report come in
      er2.hasBeenReceived(null, function (err,hbr) {
        chai.expect(err).to.not.exist
        hbr.should.equal(true)
        done()
      })
    })
  })

  after( function (done) {
    nock.cleanAll()
    nockSF = null
    nockHP = null
    stubEW.restore()
    cleanup(null,done)
  })
})


describe('When only one trawler returns results', function () {

  this.timeout(timeout)

  var nockSF, nockHP, nockGT,
    qsSF, qsHP, qsGT,
    tdSF, tdHP, tdGT

  before(function (done) {

    tdSF = []
    tdGT = []
    tdHP = tweetDataHP.slice()

    qsSF = { screen_name: "SecretFlying",   count: 5, trim_user: "true", exclude_replies: "true" }
    qsHP = { screen_name: "HolidayPirates", count: 5, trim_user: "true", exclude_replies: "true" }
    qsGT = { sort: "date", q: "microwave" }

    nockSF = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)
    nockGT = nock(gumtreeHost).persist().get(gumtreeUri).query(qsGT).reply(200,tdGT)

    startScript(null, done)
  })



  it ('Sends a successful report with the results received by that trawler', function(done) {

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

  var nockSF, nockHP, nockGT,
    qsSF, qsHP, qsGT,
    tdSF, tdHP, tdGT


  before(function (done) {

    tdSF = []
    tdHP = []
    tdGT = []

    qsSF = { screen_name: "SecretFlying",   count: 5, trim_user: "true", exclude_replies: "true" }
    qsHP = { screen_name: "HolidayPirates", count: 5, trim_user: "true", exclude_replies: "true" }
    qsGT = { sort: "date", q: "microwave" }

    nockSF = nock(twitterHost).persist().get(twitterUri).query(qsSF).reply(200,tdSF)
    nockHP = nock(twitterHost).persist().get(twitterUri).query(qsHP).reply(200,tdHP)
    nockGT = nock(gumtreeHost).persist().get(gumtreeUri).query(qsGT).reply(200,tdGT)

    startScript(null, done)
  })



  it('Does not send any kind of report', function(done) {
    // Get the report email
    var er = getNewEN({who: 'r', gsc: 'is:inbox to:' + recipientAddress})
    er.hasBeenReceived(null, function (err,hbr) {
      chai.expect(err).to.not.exist
      hbr.should.equal(false)
      done()
    })
  })

  after(function (done) {
    nock.cleanAll()
    nockSF = null
    nockHP = null
    cleanup(null,done)
  })
})
