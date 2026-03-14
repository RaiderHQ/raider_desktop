export const formatXpath = (xpath: string): string => {
  if (xpath.includes("'") && xpath.includes('"')) {
    return `concat(${xpath
      .split("'")
      .map((part) => `'${part}'`)
      .join(`,"'",`)})`
  }
  if (xpath.includes("'")) {
    return `"${xpath}"`
  }
  return `'${xpath}'`
}

export const formatLocator = (selector: string): { strategy: string; value: string } => {
  if (selector.startsWith('/') || selector.startsWith('(')) {
    return { strategy: 'xpath', value: formatXpath(selector) }
  }
  if (selector.startsWith('#') && !/[\s>~+]/.test(selector)) {
    return { strategy: 'id', value: `"${selector.substring(1)}"` }
  }
  return { strategy: 'css', value: `"${selector}"` }
}

export const createNewTest = (): { id: string; name: string; url: string; steps: string[] } => ({
  id: crypto.randomUUID(),
  name: 'Untitled Test',
  url: 'https://raider-test-site.onrender.com/',
  steps: []
})
