#!/usr/bin/env node
'use strict'

const debug = require('debug')('lockfile-lint')
const glob = require('fast-glob')
const main = require('../src/main')

const isSupported =
  process.platform !== 'win32' || process.env.CI || process.env.TERM === 'xterm-256color'

const symbolsDefault = {
  info: 'ℹ',
  success: '✔',
  error: '✖'
}

const symbolsFallback = {
  info: 'i',
  success: '√',
  error: '×'
}

const symbols = isSupported ? symbolsDefault : symbolsFallback

const RESET = '\x1b[0m'
const RED = '\x1b[31m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'

let config

try {
  config = require('../src/config')(process.argv)
  debug(`parsed the following options: ${JSON.stringify(config)}`)
} catch (errorPayload) {
  debug(`error loading options from CLI arguments/files: ${errorPayload}`)
  process.exit(1)
}

const isPrettyFormat = config.format === 'pretty'

const validators = []
const supportedValidators = new Map([
  ['allowed-hosts', 'validateHosts'],
  ['validate-https', 'validateHttps'],
  ['validate-package-names', 'ValidatePackageNames'],
  ['allowed-schemes', 'validateSchemes'],
  ['allowed-urls', 'validateUrls'],
  ['validate-integrity', 'validateIntegrity']
])

const lockfilesList = glob.sync(config.path)

for (const lockfilePath of lockfilesList) {
  if (lockfilesList.length > 1) {
    console.log(`\nlockfile-lint scanning: ${lockfilePath}\n`)
  }

  for (const [commandArgument, commandValue] of Object.entries(config)) {
    /**
     * If we have both --allowed-urls and --allowed-hosts flags active
     * then we can skip doing the work for allowed urls as the validator
     * for allowed hosts will check for both.
     *
     * We only need to run the check for allowed urls if the user does not
     * specify allowed hosts.
     */
    if (commandArgument === 'allowed-urls' && config['allowed-hosts']) {
      continue
    }

    if (commandValue && supportedValidators.has(commandArgument)) {
      const validatorItem = supportedValidators.get(commandArgument)
      validators.push({
        name: validatorItem,
        values: commandValue,
        options: {
          emptyHostname: config['empty-hostname'],
          allowedHosts: config['allowed-hosts'],
          allowedUrls: config['allowed-urls'],
          allowedPackageNameAliases: config['allowed-package-name-aliases']
        }
      })
    }
  }

  let result
  try {
    result = main.runValidators({
      path: lockfilePath,
      type: config.type,
      validators
    })
  } catch (errorPayload) {
    warn('ABORTING lockfile lint process due to error exceptions')
    console.error(errorPayload.message, '\n')
    console.error(errorPayload.stack, '\n')
    error('Error: command failed with exit code 1')
    process.exit(1)
  }

  const {validatorCount, validatorFailures, validatorSuccesses} = result

  debug(`total validators invoked: ${validatorCount}`)
  debug(`total validator failures: ${validatorFailures}`)
  debug(`total validator successes: ${validatorSuccesses}`)

  if (validatorFailures !== 0) {
    error('Error: security issues detected!')
    process.exit(1)
  } else {
    success('No issues detected')
  }
}

function success(message) {
  const m = [
    isPrettyFormat ? GREEN : '',
    isPrettyFormat ? symbols.success : '',
    message,
    '\n',
    isPrettyFormat ? RESET : ''
  ].filter((e) => !!e)

  console.info(m.join(' '))
}

function warn(message) {
  const m = [
    isPrettyFormat ? YELLOW : '',
    isPrettyFormat ? symbols.info : '',
    message,
    '\n',
    isPrettyFormat ? RESET : ''
  ].filter((e) => !!e)

  console.error(m.join(' '))
}

function error(message) {
  const m = [
    isPrettyFormat ? RED : '',
    isPrettyFormat ? symbols.error : '',
    message,
    '\n',
    isPrettyFormat ? RESET : ''
  ].filter((e) => !!e)

  console.error(m.join(' '))
}
