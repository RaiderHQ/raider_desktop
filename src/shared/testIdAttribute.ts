/** The attribute the runtime's test_id: reads unless config.yml names another. */
export const DEFAULT_TEST_ID_ATTRIBUTE = 'data-testid'

/** An attribute name as the gem's Selectors.attribute_css accepts it (letters, digits, _ and -). */
export const TEST_ID_ATTRIBUTE_NAME = /^[A-Za-z_][\w-]*$/

/** The configured test id attribute when usable, else the default. */
export const testIdAttributeFrom = (value: unknown): string =>
  typeof value === 'string' && TEST_ID_ATTRIBUTE_NAME.test(value)
    ? value
    : DEFAULT_TEST_ID_ATTRIBUTE
