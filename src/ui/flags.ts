// Código FIFA -> emoji da bandeira
const ISO: Record<string, string> = {
  BRA: "BR", ARG: "AR", URU: "UY", CHI: "CL", COL: "CO", ECU: "EC", PAR: "PY", PER: "PE", BOL: "BO", VEN: "VE",
  ESP: "ES", ITA: "IT", POR: "PT", FRA: "FR", GER: "DE", ENG: "GB", SCO: "GB", WAL: "GB", NIR: "GB", NED: "NL",
  BEL: "BE", USA: "US", MEX: "MX", JPN: "JP", KOR: "KR", CHN: "CN", ANG: "AO", NGA: "NG", GHA: "GH", CMR: "CM",
  CIV: "CI", SEN: "SN", CPV: "CV", GNB: "GW", MOZ: "MZ", HAI: "HT", CRC: "CR", HON: "HN", PAN: "PA", CUB: "CU",
  DOM: "DO", CAN: "CA", AUS: "AU", CRO: "HR", SRB: "RS", SUI: "CH", AUT: "AT", POL: "PL", RUS: "RU", UKR: "UA",
  GRE: "GR", TUR: "TR", ISR: "IL", MAR: "MA", ALG: "DZ", TUN: "TN", EGY: "EG", IRL: "IE", DEN: "DK", SWE: "SE",
  NOR: "NO", FIN: "FI", CZE: "CZ", SVK: "SK", HUN: "HU", ROU: "RO", BUL: "BG", GEO: "GE", ARM: "AM", EQG: "GQ",
  GUI: "GN", MLI: "ML", BFA: "BF", TOG: "TG", BEN: "BJ", CGO: "CG", COD: "CD", GAB: "GA", ZAM: "ZM", ZIM: "ZW",
  RSA: "ZA", KEN: "KE", SUR: "SR", GUY: "GY", TRI: "TT", JAM: "JM", SLV: "SV", GUA: "GT", NCA: "NI", LBN: "LB",
  SYR: "SY", IRN: "IR", IRQ: "IQ", KSA: "SA", QAT: "QA", IND: "IN", IDN: "ID", PHI: "PH", THA: "TH", VIE: "VN",
  PLE: "PS", SVN: "SI", BIH: "BA", MNE: "ME", MKD: "MK", ALB: "AL", KVX: "XK", LUX: "LU", ISL: "IS", EST: "EE",
  LVA: "LV", LTU: "LT", BLR: "BY", MDA: "MD", KAZ: "KZ", UZB: "UZ", NZL: "NZ", CUW: "CW", PUR: "PR", SLE: "SL",
  LBR: "LR", GAM: "GM", MTN: "MR", NIG: "NE", SDN: "SD", ETH: "ET", UGA: "UG", TAN: "TZ", RWA: "RW",
};

export function flag(code: string): string {
  const iso = ISO[code];
  if (!iso) return "🏳️";
  return String.fromCodePoint(...[...iso].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export const COUNTRY_NAME: Record<string, string> = {
  BRA: "Brasil", ARG: "Argentina", URU: "Uruguai", CHI: "Chile", COL: "Colômbia", ECU: "Equador", PAR: "Paraguai",
  PER: "Peru", BOL: "Bolívia", VEN: "Venezuela", POR: "Portugal", ESP: "Espanha", ITA: "Itália", FRA: "França",
  GER: "Alemanha", NED: "Holanda", ENG: "Inglaterra", USA: "EUA",
};
