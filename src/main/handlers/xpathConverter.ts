const xpathConverter = (xpath: string): string => {
  // If it contains both single and double quotes, use concat
  if (xpath.includes("'") && xpath.includes('"')) {
    // Split by single quotes, wrap each part in single quotes, and join with a literal single quote.
    return `concat(${xpath.split("'").map(part => `'${part}'`).join(`,"'",`)})`
  }

  // If it only contains single quotes, wrap in double quotes
  if (xpath.includes("'")) {
    return `"${xpath}"`
  }

  // Otherwise (no single quotes, maybe double quotes), wrap in single quotes
  return `'${xpath}'`
}

export default xpathConverter
