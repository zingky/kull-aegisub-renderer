// fixPortableIcon.mjs — chép icon kimishinu multi-size vào portable exe (node-rcedit, ESM).
import { rcedit } from 'rcedit'
import path from 'path'
import { fileURLToPath } from 'url'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const exe = path.join(root, 'release', 'KullAegisubRenderer-1.0.0-portable.exe')
const icon = path.join(root, 'build', 'icon.ico')

await rcedit(exe, { icon })
console.log('OK: icon da nap vao', exe)
