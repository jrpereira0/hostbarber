/** Nome do produto SaaS (plataforma), não de uma barbearia específica. */
export const PRODUCT_NAME = "HOSTBARBER";

/** Nome exibido em metadata / login da plataforma. */
export const SYSTEM_NAME = PRODUCT_NAME;

/**
 * Ícone do produto (login, sidebars, favicon).
 * Nome versionado pra evitar cache do navegador/Next ao trocar a arte.
 */
export const PRODUCT_ICON_PATH = "/brand-mark.png";

/** Fallback quando a loja ainda não cadastrou nome. */
export const DEFAULT_SHOP_NAME = "Barbearia";

/** Fallback de logo da loja quando ainda não há upload. */
export const DEFAULT_SHOP_LOGO_PATH = PRODUCT_ICON_PATH;
