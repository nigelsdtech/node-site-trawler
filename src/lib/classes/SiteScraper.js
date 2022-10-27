"use strict"


import cheerio from 'cheerio'
import request, { RequestPromiseAPI } from 'request-promise-native'


const defaultUserAgent = 'Mozilla/5.0 (Linux; Android 4.4.2; Nexus 4 Build/KOT49H) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/48.0.2564.23 Mobile Safari/537.36'



/**
 * 
 * @param {siteScraperConfig} params
 */
export function createConfigs ({
    providerSite: {
        baseUrl,
        loginForm,
        loggedInCookieNames = ['.AspNet.ApplicationCookie', 'ASP.NET_SessionId']
    }
}) {

    return {
        providerSite: {
            baseUrl,
            loginForm,
            loggedInCookieNames
        }
    }
}

/**
 * 
 * getRequester
 * 
 * Creates a request default object with the given settings
 */
export function getRequester ({
    baseUrl,
    reqTimeout = (1000 * 10),
    userAgent = defaultUserAgent
}) {
    return request.defaults({
        baseUrl : baseUrl.href,
        timeout : reqTimeout,
        followAllRedirects : true,
        jar : true,
        headers: {
            'Upgrade-Insecure-Requests' : '1',
            'User-Agent'                : userAgent
        },
        gzip: true
    });
}


/**
 * 
 * @returns {Promise<void>}
 */
export async function doLoginWithCookies({
    log,
    formUri,
    formInputs,
    loggedInCookieNames,
    requester
}) {


    const isLoginSuccessful = await doLoginFramework({
        log,
        formUri,
        formInputs,
        requester,
        determineLoginWasSuccessful: ({response = {headers: {}}}) => {
            const cookies = response.headers['set-cookie']
            if (typeof cookies === 'undefined') {
                log.error(`Not logged in: No cookies found`)
                return false
            }
    
            const foundCookies = cookies
                .map((cookie, i) => {
                    const cookieDetails = cookie.split(';')
                    const [cookieName, cookieValue] = cookieDetails[0].split('=')
                    return {name: cookieName, value: cookieValue}
                })
            log.debug(`Cookies = ${JSON.stringify(foundCookies)}`)
    
    
            // Check that the login cookies were set
            for (var loggedInCookieName of loggedInCookieNames) {  
    
                log.debug(`Searching for ${loggedInCookieName}`)
                const foundVal = foundCookies.find((c) => {
                    log.debug(`--> Testing against ${JSON.stringify(c)}`);
                    return (c.name === loggedInCookieName && c.value != '')
                })
    
                if (typeof foundVal === 'undefined') {
                    log.error(`Cookie ${loggedInCookieName} not found in: - ${cookies}`)
                    return false
                }
            }

            return true
        }
    })

}

/**
 * Attempts a login and a logged in status is deemed successful based on text found on the result page
 *
 * @returns {Promise<void>}
 */
export async function doLoginWithPageText({
    log,
    formUri,
    formInputs,
    requester,
    searchRe,
}) {

    await doLoginFramework({
        log,
        formUri,
        formInputs,
        requester,
        determineLoginWasSuccessful: ({response = {body: ""}}) => {
            log.info(`========================Testing the body with ${searchRe}==========\n`)

            const isSearchMatched = response.body.match(searchRe)
            if (!isSearchMatched) {
                log.error('doLoginWithPageText: Search was not matched\n' + response.body)
                throw new Error('doLoginWithPageText: Search was not matched')
            }
        }
    })

}

async function doLoginFramework ({
    log,
    formUri = "",
    formInputs = {},
    determineLoginWasSuccessful,
    requester
}) {

    log.debug('doLoginFramework - Getting login page')
    // Prepare the form
    const {action: formSubmitUri, inputs} = await prepareForm({
        log,
        formUri,
        formInputs,
        requester
    })

    log.info('Logging in to site...')

    // Submit it and check for the cookies
    return requester
    .post({
        uri: formSubmitUri,
        form: inputs,
        resolveWithFullResponse: true,
        simple: true
    })
    .then((response) => {
        if ([200, 302].indexOf(response.statusCode) == -1) {
            const errMsg = `Bad response: [${response.statusCode}] ${response.body}`
            log.error(errMsg)
            throw new Error(errMsg);
        }

        log.debug('Form full response:')
        log.debug(response.statusCode)
        log.debug(response.body)
        return determineLoginWasSuccessful({response: response})
    })
    .catch((e) => {
        const reason = new Error(`Login failed: ${e.message}`)
        log.error(reason)
        log.error(e.stack)
        throw reason
    })
}

/**
 * @typedef {object} loginFormInputs
 * @param {string} action - uri to which the form will submit
 * @param {object} inputs - object where the key/value represent form fields and values
 */
/**
 * Get the login form and prepare the fields to submit (username, password, etc)
 * 
 * @returns {loginFormInputs}
 */
async function prepareForm ({
    log,
    formUri = "",
    formInputs = {},
    requester
}) {

    const errMsg = 'prepareForm: Login form not as expected'

    log.info('Getting login form...')

    // Go to the login site
    const form = await requester.get({
        uri: formUri,
        followAllRedirects: true,
        simple: false,
        transform: (body) => {return cheerio.load(body)('form')}
    })
    .catch((e) => {
        log.error(`Error getting login form: ${e}`)
        throw e
    })

    log.debug('Got form: ' + form)

    const action = (() => {
        try {
            const a = form.attr().action
            return a
        } catch (e) {
            log.error(errMsg)
            log.error(e)
            log.error(form)
            throw new Error(errMsg)
        }
    })()
    

    // Get all the form inputs and fill them out with the intended fields
    const fInputs = form
    .find('input')
    .get()
    .reduce((accumulator, el) => {
        if (el.attribs.type == "submit") {return accumulator}

        const fieldName = el.attribs.name
        const retVal = (formInputs.hasOwnProperty(fieldName))? formInputs[fieldName] : el.attribs.value;
        log.info(`Testing ${fieldName}. Got ${retVal}`)
        
        return Object.assign({}, accumulator, {[fieldName]: retVal})

    }, {})

    log.debug(`Prepared form with action '${action} and inputs ${JSON.stringify(fInputs)}`)
    return {
        action: action,
        inputs: fInputs
    }
}