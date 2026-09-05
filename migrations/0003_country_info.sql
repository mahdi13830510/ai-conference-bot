/*
 * Official government visa portals for the countries that
 * appear in the conference feed.
 *
 * These are entry points to authoritative sources only. The
 * bot never states visa requirements itself, because they
 * depend on the traveller's nationality and change often.
 */

INSERT OR REPLACE INTO country_info (country, visa_url, visa_note, currency)
VALUES
    ('USA', 'https://travel.state.gov/content/travel/en/us-visas.html', 'B-1 business/conference visa or ESTA under the Visa Waiver Program.', 'USD'),
    ('Canada', 'https://www.canada.ca/en/immigration-refugees-citizenship/services/visit-canada.html', 'Visitor visa or eTA depending on nationality.', 'CAD'),
    ('UK', 'https://www.gov.uk/check-uk-visa', 'Standard Visitor visa covers conferences.', 'GBP'),
    ('Ireland', 'https://www.irishimmigration.ie/', 'Not in the Schengen Area. A separate Irish visa may be required.', 'EUR'),
    ('Italy', 'https://vistoperitalia.esteri.it/', 'Schengen Area member.', 'EUR'),
    ('Spain', 'https://www.exteriores.gob.es/', 'Schengen Area member.', 'EUR'),
    ('France', 'https://france-visas.gouv.fr/en/', 'Schengen Area member.', 'EUR'),
    ('Germany', 'https://www.auswaertiges-amt.de/en/visa-service', 'Schengen Area member.', 'EUR'),
    ('Austria', 'https://www.bmeia.gv.at/en/travel-stay/entry-and-residence-in-austria/', 'Schengen Area member.', 'EUR'),
    ('Netherlands', 'https://ind.nl/en', 'Schengen Area member.', 'EUR'),
    ('Greece', 'https://www.mfa.gr/en/visas/', 'Schengen Area member.', 'EUR'),
    ('Portugal', 'https://vistos.mne.gov.pt/en/', 'Schengen Area member.', 'EUR'),
    ('Czech Republic', 'https://mzv.gov.cz/jnp/en/information_for_aliens/', 'Schengen Area member.', 'CZK'),
    ('Hungary', 'https://konzuliszolgalat.kormany.hu/en', 'Schengen Area member.', 'HUF'),
    ('Malta', 'https://identita.gov.mt/central-visa-unit/', 'Schengen Area member.', 'EUR'),
    ('Denmark', 'https://www.nyidanmark.dk/en-GB', 'Schengen Area member.', 'DKK'),
    ('Norway', 'https://www.udi.no/en/', 'Schengen Area member.', 'NOK'),
    ('Sweden', 'https://www.migrationsverket.se/en/', 'Schengen Area member.', 'SEK'),
    ('Finland', 'https://migri.fi/en/', 'Schengen Area member.', 'EUR'),
    ('Switzerland', 'https://www.sem.admin.ch/sem/en/home/themen/einreise.html', 'Schengen Area member.', 'CHF'),
    ('Belgium', 'https://dofi.ibz.be/en', 'Schengen Area member.', 'EUR'),
    ('Poland', 'https://www.gov.pl/web/diplomacy', 'Schengen Area member.', 'PLN'),
    ('Lithuania', 'https://www.migracija.lt/en', 'Schengen Area member.', 'EUR'),
    ('Croatia', 'https://mvep.gov.hr/services-for-citizens/consular-information/visas/22802', 'Schengen Area member.', 'EUR'),
    ('Cyprus', 'http://www.mfa.gov.cy/', 'EU member, not yet in the Schengen Area.', 'EUR'),
    ('Romania', 'https://evisa.mae.ro/', 'EU member.', 'RON'),
    ('Turkey', 'https://www.evisa.gov.tr/', 'e-Visa available for many nationalities.', 'TRY'),
    ('Japan', 'https://www.mofa.go.jp/j_info/visit/visa/', 'Short-stay visa. Many nationalities are exempt.', 'JPY'),
    ('China', 'https://www.visaforchina.cn/', 'M or F visa typically required for conferences.', 'CNY'),
    ('South Korea', 'https://www.visa.go.kr/', 'K-ETA or short-stay visa depending on nationality.', 'KRW'),
    ('Singapore', 'https://www.ica.gov.sg/enter-depart/entry_requirements', 'SG Arrival Card required for all visitors.', 'SGD'),
    ('India', 'https://indianvisaonline.gov.in/', 'e-Conference visa requires clearance from the host ministry.', 'INR'),
    ('Australia', 'https://immi.homeaffairs.gov.au/', 'Visitor visa or ETA depending on nationality.', 'AUD'),
    ('New Zealand', 'https://www.immigration.govt.nz/', 'NZeTA required for visa-waiver nationalities.', 'NZD'),
    ('Brazil', 'https://www.gov.br/mre/pt-br/assuntos/portal-consular/vistos', 'e-Visa available for some nationalities.', 'BRL'),
    ('Mexico', 'https://www.gob.mx/sre', 'Visitor visa or exemption depending on nationality.', 'MXN'),
    ('UAE', 'https://icp.gov.ae/en/', 'Visa on arrival for many nationalities.', 'AED'),
    ('Israel', 'https://www.gov.il/en/departments/population_and_immigration_authority', 'ETA-IL required for visa-exempt nationalities.', 'ILS'),
    ('Taiwan', 'https://www.boca.gov.tw/mp-2.html', 'Visa-exempt entry available for many nationalities.', 'TWD'),
    ('Hong Kong', 'https://www.immd.gov.hk/eng/', 'Separate entry rules from mainland China.', 'HKD'),
    ('Thailand', 'https://www.thaievisa.go.th/', 'e-Visa available. Thailand Digital Arrival Card required.', 'THB'),
    ('Vietnam', 'https://evisa.gov.vn/', 'e-Visa available online.', 'VND'),
    ('Indonesia', 'https://evisa.imigrasi.go.id/', 'e-VOA available for many nationalities.', 'IDR'),
    ('Malaysia', 'https://malaysiavisa.imi.gov.my/', 'Malaysia Digital Arrival Card required.', 'MYR'),
    ('Morocco', 'https://www.consulat.ma/en', 'Visa-exempt entry available for many nationalities.', 'MAD'),
    ('Rwanda', 'https://irembo.gov.rw/', 'Visa on arrival for all nationalities.', 'RWF'),
    ('Ukraine', 'https://mfa.gov.ua/en/consular-affairs/entry-and-stay-foreigners-ukraine', 'Check current travel advisories before booking.', 'UAH');
