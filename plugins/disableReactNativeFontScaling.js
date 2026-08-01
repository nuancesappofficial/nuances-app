module.exports = function disableReactNativeFontScaling({ types: t }) {
  return {
    name: 'disable-react-native-font-scaling',
    visitor: {
      Program(programPath) {
        const textComponents = new Set();
        const animatedComponents = new Set();

        for (const statement of programPath.node.body) {
          if (!t.isImportDeclaration(statement) || statement.source.value !== 'react-native') {
            continue;
          }

          for (const specifier of statement.specifiers) {
            if (!t.isImportSpecifier(specifier)) {
              continue;
            }

            const importedName = t.isIdentifier(specifier.imported)
              ? specifier.imported.name
              : specifier.imported.value;

            if (importedName === 'Text' || importedName === 'TextInput') {
              textComponents.add(specifier.local.name);
            } else if (importedName === 'Animated') {
              animatedComponents.add(specifier.local.name);
            }
          }
        }

        programPath.traverse({
          JSXOpeningElement(openingPath) {
            const { name, attributes } = openingPath.node;
            const isTextComponent =
              (t.isJSXIdentifier(name) && textComponents.has(name.name)) ||
              (t.isJSXMemberExpression(name) &&
                t.isJSXIdentifier(name.object) &&
                animatedComponents.has(name.object.name) &&
                t.isJSXIdentifier(name.property, { name: 'Text' }));

            if (!isTextComponent) {
              return;
            }

            const hasFontScalingOverride = attributes.some(
              (attribute) =>
                t.isJSXAttribute(attribute) &&
                t.isJSXIdentifier(attribute.name, { name: 'allowFontScaling' }),
            );

            if (!hasFontScalingOverride) {
              attributes.push(
                t.jsxAttribute(
                  t.jsxIdentifier('allowFontScaling'),
                  t.jsxExpressionContainer(t.booleanLiteral(false)),
                ),
              );
            }
          },
        });
      },
    },
  };
};
