'use strict';
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'settings.json');

const DEFAULTS = {
  botName: 'Levi',
  prefix: '.',
  timezone: 'Africa/Cairo',
  owners: [],
  devName: 'Ahmed Mobark',
  devPhone: '201287881592',
  devTg: 'ahmedmohmedmobark',
  waChannel: 'https://whatsapp.com/channel/0029Vb7Tdre8qJ01I3DioT01',
  tgChannel: 'https://t.me/SE_EH0'
};

let saved = {};
try {
  saved = JSON.parse(fs.readFileSync(FILE, 'utf8'));
} catch {
  saved = {};
}

module.exports = { ...DEFAULTS, ...saved };
