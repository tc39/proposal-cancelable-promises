"use strict";
const Promise = require("../../lib/promise.js");

module.exports = ms => new Promise(resolve => setTimeout(resolve, ms));
