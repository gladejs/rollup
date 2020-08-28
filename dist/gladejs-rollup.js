'use strict'

const path = require('path')
const glob = require('glob')

const relateURL = require('relateurl')
const markoLoader = require('marko').load

const compiler = require('marko/compiler')
const isProd = process.env.NODE_ENV === 'production'

// Making sure the "glade-rollup" taglib is registered.
compiler.registerTaglib(require.resolve('../marko.json'))

compiler.configure({
  writeToDisk: false, // we don't need no ".marko.js" files
  preserveWhitespace: !isProd, // minification in Production
  ignoreUnrecognizedTags: true // error-free Web Components
})

module.exports = function (envVar = { }) {
  return {
    name: 'gladejs',

    options (options) {
      options.input = listMarkoPages(options.input)
      options.manualChunks = gladeChunking(options.manualChunks)
    },

    generateBundle (_, bundle) {
      let assets = Object.values(bundle).find(entry => entry.name === 'assets')
      if (assets === undefined) assets = { fileName: '@@undefined@@', code: '' }

      const assetPaths = new Function('assets', assets.code + 'return assets;')([]) // eslint-disable-line no-new-func
      const assetRegExp = new RegExp('import[^;]+/' + assets.fileName + '["\'];')
      const assetReducer = (code, path) => code.replace(new RegExp(path[0], 'g'), path[1])

      Object.values(bundle).filter(entry =>
        entry.isEntry && entry.facadeModuleId.endsWith('.marko')
      ).forEach(file => {
        const pageId = getMarkoPageId(file.name)
        const styles = listStyleAssets(bundle, pageId)
        const module = file.code.replace(assetRegExp, '').trim()

        file.code = '' // Empty the Marko JS file, it will be removed from the bundle
        const data = { envVar: envVar, pageId: pageId, styles: styles, module: module }

        const template = getMarkoFacade(file.facadeModuleId)
        const rendered = template.renderToString({ $global: data })
        const htmlCode = assetPaths.reduce(assetReducer, rendered)

        this.emitFile({ type: 'asset', source: htmlCode, fileName: `${file.name}.html` })
      })

      assets.code = ''
      Object.values(bundle).forEach(entry => {
        if (entry.code === '') delete bundle[entry.fileName]

        else if (entry.type === 'chunk') {
          entry.code = entry.code.replace(assetRegExp, '').trim()
          entry.code = assetPaths.reduce(assetReducer, entry.code)
        }
      })
    }
  }
}

function listMarkoPages (inputDir) {
  const pages = glob.sync('*.marko', {
    cwd: inputDir,
    absolute: true,
    matchBase: true,
    ignore: '**/components/**'
  })

  return pages.reduce((list, page) => {
    const name = page.substring(inputDir.length + 1, page.length - 6)
    list[name] = page
    return list
  }, {})
}

function gladeChunking (userChunking) {
  return (id) => {
    const sep = path.sep

    if (id.endsWith('|assets')) return 'assets'
    if (userChunking) return userChunking(id)

    else if (id.endsWith('.js') || id.endsWith('.marko')) {
      if (id.startsWith(path.resolve('components'))) return 'js/project'

      if (id.includes(`${sep}node_modules${sep}raptor-util${sep}`)) return 'js/markojs'
      if (id.includes(`${sep}node_modules${sep}marko${sep}`)) return 'js/markojs'

      if (id.includes(`${sep}node_modules${sep}`)) return 'js/modules'
      if (id === '\0commonjsHelpers.js') return 'js/modules'
    }
  }
}

function getMarkoPageId (fileId) {
  if (fileId === 'index') return '/'

  if (fileId.endsWith('/index')) {
    return '/' + fileId.substring(0, fileId.length - 5)
  } else return `/${fileId}.html`
}

function listStyleAssets (bundle, pageId) {
  return Object.values(bundle).filter(entry =>
    entry.fileName.endsWith('.css')
  ).map(file =>
    ({
      code: file.source,
      href: getRelativePath(pageId, '/' + file.fileName)
    })
  )
}

function getRelativePath (from, to) {
  const options = { output: relateURL.PATH_RELATIVE }
  const relative = relateURL.relate('//x' + from, to, options)

  return relative.startsWith('.') ? relative : './' + relative
}

function getMarkoFacade (moduleId) {
  const tagIndex = moduleId.indexOf(':')
  const pagePath = moduleId.substring(tagIndex + 1)

  delete require.cache[pagePath + '.js']
  return markoLoader(pagePath)
}
