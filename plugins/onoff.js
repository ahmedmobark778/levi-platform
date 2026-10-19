import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const GROUPS_FILE = path.join(__dirname, '..', 'groups.json')

function getGroups() { try { return JSON.parse(fs.readFileSync(GROUPS_FILE)); } catch(e) { return {}; } }
function saveGroups(d) { fs.writeFileSync(GROUPS_FILE, JSON.stringify(d, null, 2)); }

const handler = async (m, { conn, args, command }) => {
  if (!m.isGroup) return m.reply('🔒 هذا الأمر مخصص للجروبات فقط.')
  
  const type = (args[0] || '').toLowerCase()
  const enable = command === 'on'
  
  if (!['antilink', 'welcome'].includes(type)) {
    return m.reply('🌟 استخدم:\\n.on antilink\\n.off antilink\\n.on welcome\\n.off welcome')
  }
  
  const groups = getGroups()
  if (!groups[m.chat]) groups[m.chat] = {}
  groups[m.chat][type] = enable
  saveGroups(groups)
  
  return m.reply('✅ ' + type + ' ' + (enable ? 'مفعل' : 'متوقف') + ' بنجاح.')
}

handler.command = ['on', 'off']
handler.group = true
export default handler
