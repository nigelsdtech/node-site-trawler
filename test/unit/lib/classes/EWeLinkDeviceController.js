const
  cfg             = require('config'),
  chai            = require('chai'),
  jsonFile        = require('jsonfile'),
  {promisify}     = require('util'),
  ewelinkApi      = require('ewelink-api'),
  sinon           = require('sinon'),
  EWeLinkDeviceController  = require('../../../../lib/classes/EWeLinkDeviceController.js');

/*
 * Set up chai
 */
chai.should();


// Common testing timeout
var timeout = cfg.timeout || (2*1000);

var basicClassInstantiation = {
  id: "fanController",
  username: "fakePerson",
  password: "fakePassword",
  region: "eu",
  regexMatches: [
    {"pattern" : "^Imaginary Fan Switched on$", "flags": "gi" },
    {"pattern" : "^Porch light Switched off$", "flags": "gi" }
  ]
}

const responseData = jsonFile.readFileSync('./test/data/ewelink/responseSonoff.json')

const elapsedTimeThreshold = 150000

/*
 * The actual tests
 */

describe('EWeLinkDeviceController', () => {
  
  describe('getResults', function () {

    this.timeout(timeout)
  
    const b = Object.assign({},basicClassInstantiation)
    
    var getDevicesStub, setDevicePowerStateStub
    
    before (function () {
      getDevicesStub = sinon.stub(ewelinkApi.prototype,"getDevices")
      setDevicePowerStateStub = sinon.stub(ewelinkApi.prototype,"setDevicePowerState")
    })

    afterEach (function () {
      getDevicesStub.reset()
      setDevicePowerStateStub.reset()
    })
    after (function () {
      getDevicesStub.restore()
      setDevicePowerStateStub.restore()
    })

    /**
     * 
     * @param {Object} params
     * @param {Object} params.opts - initializer for the ewelink object
     * @param {Object} params.eWeLinkResponse - stubbed response from EWeLink
     * @returns {Promise<string[]>} - list of device names
     */
    async function getDeviceNames ({
      opts,
      eWeLinkGetDevicesResponse = responseData,
      eWeLinkSetDevicePowerStateResponse = null
    }) {

      const {savedData, ...optsToPassOn} = opts

      const ew = new EWeLinkDeviceController(optsToPassOn)
      if (typeof savedData != "undefined") {
        ew.setSavedData(savedData)
      };
      
      getDevicesStub.resolves(eWeLinkGetDevicesResponse)
      if (eWeLinkSetDevicePowerStateResponse) {
        setDevicePowerStateStub.resolves(eWeLinkSetDevicePowerStateResponse)
      } else {
        setDevicePowerStateStub.rejects("Should not reach here")
      }

      const devices = await ew.getResults(null)
        .then ((devices) => {
          return devices.map((d) => {return d.name})
        })
        .catch((e) => {throw e})

      return devices
    }


    it('returns all devices found by eWeLink when there is no known previous state', async () => {

      const opts = Object.assign({},b,{turnOffAfterElapsedMilliseconds: elapsedTimeThreshold})
      const devices = await getDeviceNames({opts:opts})

      devices.should.have.members([
        "Porch Light Switched off",
        "Imaginary Fan Switched on"
      ])

      setDevicePowerStateStub.called.should.not.be.true
    });

    it('returns a combination of devices with and without previously known states', async () => {

      const opts = Object.assign({},b,{
        turnOffAfterElapsedMilliseconds: elapsedTimeThreshold,
        savedData: {
          savedData: {
            results:[{
              name: "Porch Light Switched off",
              battery: null,
              id: "1",
              switchStatus: "off",
              online: true,
              lastUpdateTime: null
            }]
          }
        }
      })
      const devices = await getDeviceNames({opts:opts})

      devices.should.have.members([
        "Porch Light Switched off",
        "Imaginary Fan Switched on"
      ])

      setDevicePowerStateStub.called.should.not.be.true
    });

    it('returns devices with a new update time that are known to have been off previously', async () => {

      const opts = Object.assign({},b,{
        regexMatches: [
          {"pattern" : "^Porch light Switched off$", "flags": "gi" }
        ],
        turnOffAfterElapsedMilliseconds: elapsedTimeThreshold,
        savedData: {
          savedData: {
            results:[{
              name: "Porch Light Switched off",
              battery: null,
              id: "1",
              switchStatus: "off",
              online: true,
              lastUpdateTime: null
            }]
          }
        }
      })
      const devices = await getDeviceNames({opts:opts})

      devices.should.have.members([
        "Porch Light Switched off"
      ])

      setDevicePowerStateStub.called.should.not.be.true
    });
    it('returns devices found by eWeLink that were previously switched on more than x seconds ago', async () => {

      const opts = Object.assign({},b,{
        turnOffAfterElapsedMilliseconds: elapsedTimeThreshold,
        savedData: {
          savedData: {
            results: [{
              name: "Imaginary Fan Switched on",
              battery: null,
              id: "device10",
              switchStatus: "on",
              online: true,
              lastUpdateTime: 1611794189
            }, {
              name: "Porch Light Switched off",
              battery: null,
              id: "device1",
              switchStatus: "off",
              online: true,
              lastUpdateTime: 1611794189
            }]
          }
        }
      })
      const devices = await getDeviceNames({
        opts,
        eWeLinkSetDevicePowerStateResponse : {
          status: "ok",
          state: "off",
          channel: 1
        }
      })

      devices.should.have.members([
        "Porch Light Switched off",
        "Imaginary Fan Switched on"
      ])

      setDevicePowerStateStub.callCount.should.eql(1)

    });

    it("doesn't return devices found by eWeLink that were previously switched on less than x seconds ago", async () => {

      const d = new Date()
      const timeNow = d.getTime()
      const tenSecondsAgo = timeNow - 10000

      const opts = Object.assign({},b,{
        turnOffAfterElapsedMilliseconds: elapsedTimeThreshold,
        savedData: {
          savedData: {
            results: [{
              name: "Imaginary Fan Switched on",
              battery: null,
              id: "device10",
              switchStatus: "on",
              online: true,
              lastUpdateTime: tenSecondsAgo
            }, {
              name: "Porch Light Switched off",
              battery: null,
              id: "device1",
              switchStatus: "off",
              online: true,
              lastUpdateTime: tenSecondsAgo
            }]
          }
        }
      })
      const devices = await getDeviceNames({opts})

      devices.should.deep.equal([
        "Porch Light Switched off"
      ])
      setDevicePowerStateStub.called.should.not.be.true

    })
    it('returns no results if eWeLink returns nothing', async () => {

    const opts = Object.assign({},b,{
      turnOffAfterElapsedMilliseconds: elapsedTimeThreshold,
      savedData: {
        savedData: {
          results: [{
            name: "Imaginary Fan Switched on",
            battery: null,
            id: "device10",
            switchStatus: "on",
            online: true,
            lastUpdate: 1611794189
          }, {
            name: "Porch Light Switched off",
            battery: null,
            id: "device1",
            switchStatus: "off",
            online: true,
            lastUpdate: 1611794189
          }]
        }
      }
    })

    const devices = await getDeviceNames({opts: opts, eWeLinkGetDevicesResponse: []});

    devices.should.deep.equal([])
    setDevicePowerStateStub.called.should.not.be.true
  });
  
})
  

  describe('getResultsString', function () {
  
    this.timeout(timeout)
    
    const tests = [{
      testDesc: 'returns a string for no results',
      results: [],
      expectedResponse: ""
    },{
      testDesc: 'returns a string for one result',
      results: [
        {
          name: "Device low battery and not online and switch on",
          battery: 0.5,
          id: "d1",
          switchStatus: "on",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        }
      ],
      expectedResponse: ""

    },{
      testDesc: 'returns a string for many results',
      results: [
        {
          name: "Device low battery and not online and switch on",
          battery: 0.5,
          id: "d1",
          switchStatus: "on",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        },{
          name: "Device high battery and online and switch on",
          battery: 2.5,
          id: "d2",
          switchStatus: "on",
          online: true,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        },{
          name: "Device high battery and not online and switch off",
          battery: 1.5,
          id: "d3",
          switchStatus: "off",
          online: false,
          lastUpdate: "2020-08-17T23:46:05.895Z"
        }
      ],
      expectedResponse: ""
        + ""
        + ""
        + ""

    }]
  
    tests.forEach( ({
      testDesc,
      only = false,
      results,
      expectedResponse
    }) => {
  
      const itFn = (only)? it.only : it;
  
      itFn(testDesc, () => {
  
        const init = Object.assign({},basicClassInstantiation)
  
        const eWeLinkTrawler = new EWeLinkDeviceController(init)
        eWeLinkTrawler.results = results

        const resultsString = eWeLinkTrawler.getResultsString()
        resultsString.should.eql(expectedResponse)
        
      });
  
    })
  
  
  
  })
})