module.exports = function disableReactNativeFontScaling({ types: t }) {
  return {
    name: 'disable-react-native-font-scaling',
    visitor: {
      Program(programPath, state) {
        const filename =
          state.file && state.file.opts && state.file.opts.filename
            ? state.file.opts.filename
            : '';
        if (filename.includes('AppText') || filename.includes('node_modules')) {
          return;
        }

        const textComponents = new Set();
        const textInputComponents = new Set();
        const animatedComponents = new Set();
        let hasTextImport = false;

        for (const statement of programPath.node.body) {
          if (
            !t.isImportDeclaration(statement) ||
            statement.source.value !== 'react-native' ||
            statement.importKind === 'type'
          ) {
            continue;
          }

          for (const specifier of statement.specifiers) {
            if (!t.isImportSpecifier(specifier) || specifier.importKind === 'type') {
              continue;
            }

            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported.value;

            if (importedName === 'Text') {
              textComponents.add(specifier.local.name);
              hasTextImport = true;
            } else if (importedName === 'TextInput') {
              textInputComponents.add(specifier.local.name);
            } else if (importedName === 'Animated') {
              animatedComponents.add(specifier.local.name);
            }
          }
        }

        if (hasTextImport) {
          const appTextImport = t.importDeclaration(
            [t.importDefaultSpecifier(t.identifier('_NuancesAppText'))],
            t.stringLiteral('@/components/UI/shared/AppText')
          );
          programPath.unshiftContainer('body', appTextImport);
        }

        programPath.traverse({
          JSXOpeningElement(openingPath) {
            const { name, attributes } = openingPath.node;

            if (t.isJSXIdentifier(name) && textComponents.has(name.name)) {
              openingPath.node.name = t.jsxIdentifier('_NuancesAppText');
              if (openingPath.parent && openingPath.parent.closingElement) {
                openingPath.parent.closingElement.name = t.jsxIdentifier('_NuancesAppText');
              }
              return;
            }

            const isTextInput =
              t.isJSXIdentifier(name) && textInputComponents.has(name.name);
            const isAnimatedText =
              t.isJSXMemberExpression(name) &&
              t.isJSXIdentifier(name.object) &&
              animatedComponents.has(name.object.name) &&
              t.isJSXIdentifier(name.property, { name: 'Text' });

            if (isTextInput || isAnimatedText) {
              const hasFontScalingOverride = attributes.some(
                (attribute) =>
                  t.isJSXAttribute(attribute) &&
                  t.isJSXIdentifier(attribute.name, { name: 'allowFontScaling' })
              );

              if (!hasFontScalingOverride) {
                attributes.push(
                  t.jsxAttribute(
                    t.jsxIdentifier('allowFontScaling'),
                    t.jsxExpressionContainer(t.booleanLiteral(false))
                  )
                );
              }
            }
          },
        });
      },
    },
  };
};
