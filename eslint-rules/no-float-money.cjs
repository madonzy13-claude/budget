/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: { description: 'Disallow float arithmetic on Money / .amount identifiers' },
    messages: { floatMath: 'Float arithmetic on Money is forbidden — use Money.add/sub/mul (D-19, MONY-07)' },
  },
  create(context) {
    const isMoneyName = (id) => typeof id === 'string' && /(amount|money|total|sum|price|cost|balance)$/i.test(id);
    const reportIfMoney = (node, name) => {
      if (isMoneyName(name)) context.report({ node, messageId: 'floatMath' });
    };
    return {
      AssignmentExpression(node) {
        if (['+=', '-=', '*=', '/='].includes(node.operator)) {
          const id = node.left.type === 'Identifier' ? node.left.name
                   : node.left.type === 'MemberExpression' && node.left.property.type === 'Identifier' ? node.left.property.name
                   : null;
          if (id) reportIfMoney(node, id);
        }
      },
      BinaryExpression(node) {
        if (['+', '-', '*', '/'].includes(node.operator)) {
          const lid = node.left.type === 'MemberExpression' && node.left.property.type === 'Identifier' ? node.left.property.name : null;
          const rid = node.right.type === 'MemberExpression' && node.right.property.type === 'Identifier' ? node.right.property.name : null;
          if (lid) reportIfMoney(node, lid);
          if (rid) reportIfMoney(node, rid);
        }
      },
    };
  },
};
