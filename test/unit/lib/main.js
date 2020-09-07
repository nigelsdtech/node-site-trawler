'use strict'


const
  chai           = require('chai'),
  jsonFile       = require('jsonfile'),
  {stub}         = require('sinon'),
  EWeLinkTrawler = require('../../../lib/classes/EWeLinkTrawler.js'),
  GumtreeTrawler = require('../../../lib/classes/GumtreeTrawler.js'),
  TwitterTrawler = require('../../../lib/classes/TwitterTrawler.js'),
  rewire         = require('rewire'),
  main           = rewire('../../../lib/main')

/*
 * Set up chai
 */
chai.should();

const timeout = (1000*2)

/*
 * Logs
 */
const logStub = {
  info: console.log,
  debug: () => {},
  error: console.log
}

const delayWaitTime = 10


/**
 * Waits some amount of time before resolving a promise
 * @param {any}    returnVal - value to be returned
 * @param {number} time 
 */
function promiseTimeout (returnVal, time = delayWaitTime) {
  return new Promise( (resolve, reject) => {
    setTimeout(() => {resolve(returnVal)},time);
  });
};

/**
 * Waits some amount of time before resolving a promise
 * @param {function}  callback - function that will be called
 * @param {any}       returnVal - value to be returned to the second arg
 * @param {any}       returnErr - value to be returned to the first arg
 * @param {number}    time 
 */
function callbackTimeout (callback, returnVal, returnErr = null, time = delayWaitTime) {
    setTimeout(() => callback(returnErr,returnVal) ,time);
};


/*
 * Some default values for the test
 */
const
  basicTrawlerSetups = [
    {
      trawlModel: "twitter",
      setup: {
        id: "@SecretFlying-Twitter",
        maxResults: 5,
        twitterId: "SecretFlying",
        regexMatches: [
          {pattern : "roundtrip", flags: "gi" },
          {pattern : "video",     flags: "gi" }
        ]
      }
    }, {
      trawlModel: "gumtree",
      setup: {
        id: "microwave-gumtree",
        gtQuery: "sort=date&q=microwave"
      }
    }, {
      trawlModel: "ewelink",
      setup: {
        id: "ewelink-switches",
        username: "fakePerson",
        password: "fakePassword",
        region: "eu",
        spreadsheet: {
          id: 'spreadsheet123',
          subSheetName: "Sheet1"
        },
        rollCall: {
          names: ["Fridge door", "Freezer door", "Second Fridge door", "Second Freezer door"],
          attendeeFieldToTest: "name"
        }
      }
    }
  ],
  savedDataFile = 'fakeFile.json',
  basicTwitterFileSave = {
    "@SecretFlying-Twitter":{
      highestSeenId:20
    }
  },
  basicGumtreeFileSave = {
    "microwave-gumtree":{
      seenIds:["idg1","idg2"]
    }
  },
  basicTwitterResultString = "Tweet results abc",
  basicGumtreeResultString = "Gumtree results abc",
  basicEWeLinkSpreadsheetData = ['2020-01-01 00:00:00', 'cone1'],
  basicSpreadsheetCallArgs = {
    id: "spreadsheet123",
    includeValuesInResponse: true,
    range: "Sheet1",
    resource: {
      majorDimension: "ROWS",
      values: [basicEWeLinkSpreadsheetData]
    },
    retFields: ["updates(updatedData(range,values))"]
  }

/**
 * Create a stubHub with the required stubs
 */
function createStubHub ({
  createTwitterStubs = true,
  twitterTrawlerGetDataToSave = {highestSeenId: 20},
  twitterTrawlerGetResultsString = basicTwitterResultString,
  createGumtreeStubs = true,
  gumtreeTrawlerGetDataToSave = {seenIds: ['idg1','idg2']},
  gumtreeTrawlerGetResultsString = basicGumtreeResultString,
  eWeLinkTrawlerGetSpreadsheetDataToSave = basicEWeLinkSpreadsheetData,
  doesGumtreeFailToLoad = false,
  spreadsheetAppenderError = null,
  sendCompletionNoticeIsCalled = true,
  sendErrorNoticeIsCalled = false
} = {}) {
  const stubHub = {
    getSavedData: null,
    twitterTrawlerGetResults: null,
    twitterTrawlerGetDataToSave: null,
    twitterTrawlerGetSpreadsheetDataToSave: null,
    twitterTrawlerGetResultsString: null,
    gumtreeTrawlerGetResults: null,
    gumtreeTrawlerGetDataToSave: null,
    gumtreeTrawlerGetSpreadsheetDataToSave: null,
    gumtreeTrawlerGetResultsString: null,
    eWeLinkTrawlerGetResults: null,
    eWeLinkTrawlerGetDataToSave: null,
    eWeLinkTrawlerGetSpreadsheetDataToSave: null,
    eWeLinkTrawlerGetResultsString: null,
    spreadsheetAppender: null,
    sendCompletionNotice: null,
    sendErrorNotice: null,
    saveNewData: null
  }

  const stubsThatShouldNotReach = []

  stubHub.getSavedData = stub(jsonFile, "readFile").callsFake((_,cb) => callbackTimeout(cb,{}))

  if (createTwitterStubs) {
    stubHub.twitterTrawlerGetResults = stub(TwitterTrawler.prototype, 'getResults').callsFake((p,cb) => callbackTimeout(cb))
    stubHub.twitterTrawlerGetDataToSave = stub(TwitterTrawler.prototype, 'getDataToSave').returns(twitterTrawlerGetDataToSave)
    stubHub.twitterTrawlerGetSpreadsheetDataToSave = stub(TwitterTrawler.prototype, 'getDataToSaveToSpreadsheet').throws("twitterTrawlerGetSpreadsheetDataToSave stub - should not get here")
    stubHub.twitterTrawlerGetResultsString = stub(TwitterTrawler.prototype, 'getResultsString').returns(twitterTrawlerGetResultsString)
  } else {
    stubsThatShouldNotReach.push("twitterTrawlerGetResults", "twitterTrawlerGetDataToSave", "twitterTrawlerGetSpreadsheetDataToSave", "twitterTrawlerGetResultsString")
  }

  if (createGumtreeStubs) {
    const
      gtgr = stub(GumtreeTrawler.prototype, 'getResults'),
      gtgdts = stub(GumtreeTrawler.prototype, 'getDataToSave'),
      gtgrs = stub(GumtreeTrawler.prototype, 'getResultsString')
    if (doesGumtreeFailToLoad) {
      gtgr.callsFake((p,cb) => callbackTimeout(cb,null,"fake gumtree load error"))
      gtgdts.throws('gumtreeTrawler.getDataToSave - Should not get here')
      gtgrs.throws('gumtreeTrawler.getResultsString - Should not get here')
    } else {
      gtgr.callsFake((p,cb) => callbackTimeout(cb))
      gtgdts.returns(gumtreeTrawlerGetDataToSave)
      gtgrs.returns(gumtreeTrawlerGetResultsString)
    }
    stubHub.gumtreeTrawlerGetResults = gtgr
    stubHub.gumtreeTrawlerGetDataToSave = gtgdts
    stubHub.gumtreeTrawlerGetSpreadsheetDataToSave = stub(GumtreeTrawler.prototype, 'getDataToSaveToSpreadsheet').throws("gumtreeTrawlerGetSpreadsheetDataToSave stub - should not get here")
    stubHub.gumtreeTrawlerGetResultsString = gtgrs
  } else {
    stubsThatShouldNotReach.push("gumtreeTrawlerGetResults", "gumtreeTrawlerGetDataToSave", "gumtreeTrawlerGetSpreadsheetDataToSave", "gumtreeTrawlerGetResultsString")
  }
  

  stubHub.eWeLinkTrawlerGetResults = stub(EWeLinkTrawler.prototype, 'getResults').callsFake((p,cb) => callbackTimeout(cb))    
  stubHub.eWeLinkTrawlerGetDataToSave = stub(EWeLinkTrawler.prototype, 'getDataToSave').returns({})  
  stubHub.eWeLinkTrawlerGetSpreadsheetDataToSave = stub(EWeLinkTrawler.prototype, 'getDataToSaveToSpreadsheet').returns(eWeLinkTrawlerGetSpreadsheetDataToSave)
  stubHub.eWeLinkTrawlerGetResultsString = stub(EWeLinkTrawler.prototype, 'getResultsString').returns("")

  const ssa = stub()
  if (spreadsheetAppenderError) {
    ssa.rejects(spreadsheetAppenderError)
  } else {
    ssa.resolves(promiseTimeout('This is a spreadsheet response'))
  }
  stubHub.spreadsheetAppender = ssa


  stubHub.saveNewData = stub(jsonFile, "writeFile").callsFake((filename, contents, cb) => {callbackTimeout(cb)})

  stubHub.sendCompletionNotice = stub()
  if (sendCompletionNoticeIsCalled) {
    stubHub.sendCompletionNotice.resolves(promiseTimeout())
  } else {
    stubsThatShouldNotReach.push("sendCompletionNotice")
  }

  stubHub.sendErrorNotice = stub()
  if (sendErrorNoticeIsCalled) {
    stubHub.sendErrorNotice.resolves(promiseTimeout())
  } else {
    stubsThatShouldNotReach.push('sendErrorNotice')
  }
  

  stubsThatShouldNotReach.forEach (s => {
    stubHub[s] = stub().throws(`${s} - should not get here`)
  })


  return stubHub
}

function cleanStubHub (stubHub) {
  for (const v of Object.values(stubHub)) {
    if (v.wrappedMethod) v.restore(); else v.reset();
  }
}



const runMain = main.__get__("main")

/*
 * The actual tests
 */

describe.only('main', function () {

  this.timeout(timeout)

  describe('When trawlers return successful new results', function () {

    var stubHub

    before(async () => {

      stubHub = createStubHub()
      await runMain({
        trawlerSetups: basicTrawlerSetups,
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ('Saves the data to local file', () => {
      stubHub.saveNewData.withArgs(savedDataFile,(Object.assign({},basicTwitterFileSave, basicGumtreeFileSave))).calledOnce.should.be.true
      stubHub.saveNewData.calledOnce.should.be.true
    })
    it ('Saves the data to spreadsheet', () => {
      stubHub.spreadsheetAppender.withArgs(basicSpreadsheetCallArgs).calledOnce.should.be.true
      stubHub.spreadsheetAppender.calledOnce.should.be.true
    })
    it ('Sends a completion notice', () => {
      const resultsStr = ""
        + `<p> Trawler: ${basicTrawlerSetups[0].setup.id} ${basicTwitterResultString}`
        + `<p> Trawler: ${basicTrawlerSetups[1].setup.id} ${basicGumtreeResultString}`

      stubHub.sendCompletionNotice.withArgs({body: resultsStr}).calledOnce.should.be.true
      stubHub.sendCompletionNotice.calledOnce.should.be.true
    })
  })

  describe('Results from trawlers: One email and one spreadsheet', function () {

    var stubHub
    before(async () => {

      stubHub = createStubHub({
        gumtreeTrawlerGetDataToSave: {},
        gumtreeTrawlerGetResultsString: ""
      })
      await runMain({
        trawlerSetups: basicTrawlerSetups,
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ('Saves the data from only one trawler to local file', () => {
      stubHub.saveNewData.withArgs(savedDataFile,(Object.assign({},basicTwitterFileSave))).calledOnce.should.be.true
      stubHub.saveNewData.calledOnce.should.be.true
    })
    it ('Saves the data to spreadsheet', () => {
      stubHub.spreadsheetAppender.withArgs(basicSpreadsheetCallArgs).calledOnce.should.be.true
      stubHub.spreadsheetAppender.calledOnce.should.be.true
    })
    it ('Sends a completion notice containing content from only one trawler', () => {
      const resultsStr = `<p> Trawler: ${basicTrawlerSetups[0].setup.id} ${basicTwitterResultString}`
      stubHub.sendCompletionNotice.withArgs({body: resultsStr}).calledOnce.should.be.true
      stubHub.sendCompletionNotice.calledOnce.should.be.true
    })
  })

  describe('Results from trawlers: No email and one spreadsheet', function () {

    var stubHub
    before(async () => {

      stubHub = createStubHub({
        twitterTrawlerGetDataToSave: {},
        twitterTrawlerGetResultsString: "",
        gumtreeTrawlerGetDataToSave: {},
        gumtreeTrawlerGetResultsString: ""
      })
      await runMain({
        trawlerSetups: basicTrawlerSetups,
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ("Doesn't attempt to save to local file", () => {
      stubHub.saveNewData.calledOnce.should.be.false
    })
    it ("Saves the data to spreadsheet", () => {
      stubHub.spreadsheetAppender.withArgs(basicSpreadsheetCallArgs).calledOnce.should.be.true
      stubHub.spreadsheetAppender.calledOnce.should.be.true
    })
    it ("Doesn't send a completion notice", () => {
      stubHub.sendCompletionNotice.called.should.be.false
    })
  })
  
  describe('Results from trawlers: One email and no spreadsheet', function () {

    var stubHub
    before(async () => {

      stubHub = createStubHub({
        gumtreeTrawlerGetDataToSave: {},
        gumtreeTrawlerGetResultsString: "",
        eWeLinkTrawlerGetSpreadsheetDataToSave: null
      })
      await runMain({
        trawlerSetups: basicTrawlerSetups,
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ('Saves the data from only one trawler to local file', () => {
      stubHub.saveNewData.withArgs(savedDataFile,(Object.assign({},basicTwitterFileSave))).calledOnce.should.be.true
      stubHub.saveNewData.calledOnce.should.be.true
    })
    it ('No data to spreadsheet', () => {
      stubHub.spreadsheetAppender.called.should.be.false
    })
    it ('Sends a completion notice containing content from only one trawler', () => {
      const resultsStr = `<p> Trawler: ${basicTrawlerSetups[0].setup.id} ${basicTwitterResultString}`
      stubHub.sendCompletionNotice.withArgs({body: resultsStr}).calledOnce.should.be.true
      stubHub.sendCompletionNotice.calledOnce.should.be.true
    })
  })

  describe('Results from trawlers: One email, one failed trawler, and one spreadsheet', function () {

    var stubHub
    before(async () => {

      stubHub = createStubHub({
        gumtreeTrawlerGetDataToSave: {},
        gumtreeTrawlerGetResultsString: ""
      })
      await runMain({
        trawlerSetups: basicTrawlerSetups,
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ('Saves the data from only one trawler to local file', () => {
      stubHub.saveNewData.withArgs(savedDataFile,(Object.assign({},basicTwitterFileSave))).calledOnce.should.be.true
      stubHub.saveNewData.calledOnce.should.be.true
    })
    it ('Saves the data to spreadsheet', () => {
      stubHub.spreadsheetAppender.withArgs(basicSpreadsheetCallArgs).calledOnce.should.be.true
      stubHub.spreadsheetAppender.calledOnce.should.be.true
    })
    it ('Sends a completion notice containing content from only one trawler', () => {
      const resultsStr = `<p> Trawler: ${basicTrawlerSetups[0].setup.id} ${basicTwitterResultString}`
      stubHub.sendCompletionNotice.withArgs({body: resultsStr}).calledOnce.should.be.true
      stubHub.sendCompletionNotice.calledOnce.should.be.true
    })
  })

  describe('Spreadsheet fails to write and there are no other trawlers', () => {
    var stubHub
    before(async () => {

      stubHub = createStubHub({
        createTwitterStubs: false,
        createGumtreeStubs: false,
        spreadsheetAppenderError: "Fake spreadsheet update error",
        sendErrorNoticeIsCalled: true
      })
      await runMain({
        trawlerSetups: [basicTrawlerSetups.find((bts) => {return (bts.setup.id == "ewelink-switches")} )],
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ('Does not save to file', () => {
      stubHub.saveNewData.called.should.be.false
    })
    it ('Does not send a success email', () => {
      stubHub.sendCompletionNotice.called.should.be.false
    })
    it ('Sends a failure email', () => {
      const errMsg = "Problem running the script: <br>"
      + "Spreadsheet update failed: Fake spreadsheet update error"
      stubHub.sendErrorNotice.withArgs({errMsg: errMsg}).calledOnce.should.be.true
      stubHub.sendErrorNotice.calledOnce.should.be.true
    })
  
  })

  describe('Spreadsheet fails to write and there is another (non spreadsheet) trawler that succeeds to send an email', () => {
    var stubHub
    before(async () => {

      stubHub = createStubHub({
        createTwitterStubs: false,
        spreadsheetAppenderError: "Fake spreadsheet update error",
        sendErrorNoticeIsCalled: true
      })

      await runMain({
        trawlerSetups: basicTrawlerSetups.filter((bts) => { return (["microwave-gumtree", "ewelink-switches"].indexOf(bts.setup.id) > -1) }),
        log: logStub,
        savedDataFile: savedDataFile,
        appendToSpreadsheet: stubHub.spreadsheetAppender,
        sendCompletionNotice: stubHub.sendCompletionNotice,
        sendErrorNotice: stubHub.sendErrorNotice
      })
      .catch((e) => {
        console.log('Unexpected error when running script: ' + e)
        throw new Error(e)
      })
    })

    after(() => {
      cleanStubHub(stubHub)
    })

    it ('Saves the data from the successfull trawler to local file', () => {
      stubHub.saveNewData.withArgs(savedDataFile,(Object.assign({},basicGumtreeFileSave))).calledOnce.should.be.true
      stubHub.saveNewData.calledOnce.should.be.true
    })
    it ('Sends a completion notice for the successful trawler', () => {
      const resultsStr = ""
        + `<p> Trawler: ${basicTrawlerSetups[1].setup.id} ${basicGumtreeResultString}`

      stubHub.sendCompletionNotice.withArgs({body: resultsStr}).calledOnce.should.be.true
      stubHub.sendCompletionNotice.calledOnce.should.be.true
    })
    it ('Sends a failure email for the bad spreadsheet', () => {
      const errMsg = "Problem running the script: <br>"
      + "Spreadsheet update failed: Fake spreadsheet update error"
      stubHub.sendErrorNotice.withArgs({errMsg: errMsg}).calledOnce.should.be.true
      stubHub.sendErrorNotice.calledOnce.should.be.true
    })
  

  })

})
