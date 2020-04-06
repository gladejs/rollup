'use strict'

const path = require('path')
const normalize = require('normalize-path')

module.exports = function transform (el, context) {
  if (el.hasAttribute('src') && el.getAttributeValue('src').type === 'Literal') {
    let assetPath = el.getAttributeValue('src').value

    if (assetPath.startsWith('.')) {
      assetPath = path.resolve(path.dirname(context.filename), assetPath)
      assetPath = normalize(assetPath).replace(/^([a-zA-Z]+:|\.\/)/, '')

      el.setAttributeValue('src', context.builder.literal(assetPath))

      let assetCode = "import assetPath from '" + assetPath + "'; "
      assetCode += "assets.push(['" + assetPath + "', assetPath]);"

      context.addDependency({
        type: 'asset',
        code: assetCode,
        path: context.filename,
        virtualPath: assetPath + '|assets'
      })
    }
  }
}
