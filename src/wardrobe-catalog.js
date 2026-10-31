// 193 UN member states plus the Holy See and Palestine. No geolocation is used.
const codes = 'AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KP KR KW KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG MK NO OM PK PW PA PG PY PE PH PL PT QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA SS ES LK SD SR SE CH SY TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VE VN YE ZM ZW PS VA'.split(' ');
const names = new Intl.DisplayNames(['en'], { type: 'region' });
const nameOverrides = { VA: 'Holy See (Vatican City)', PS: 'Palestine', KR: 'South Korea', KP: 'North Korea', CG: 'Republic of the Congo', CD: 'Democratic Republic of the Congo' };
export const countries = codes.map(code => ({ code, name: nameOverrides[code] || names.of(code) })).sort((a, b) => a.name.localeCompare(b.name, 'en'));
export const styleProfiles = { male: 'Male', female: 'Female' };
export const makeupPreferences = { auto: 'Suggested for my selection', none: 'No makeup', natural: 'Minimal color / natural finish', soft: 'Soft & polished', statement: 'Statement color' };
const item = (role, shape) => ({ role, shape });
const shirt = item('Shirt', 'shirt'), trousers = item('Trousers', 'trousers'), blazer = item('Blazer', 'jacket'), shoes = item('Shoes', 'shoes'), bag = item('Bag', 'bag'), scarf = item('Scarf', 'scarf');
const make = (label, gender, parts, extra = {}) => ({ label, gender, parts, ...extra });
export const wardrobeCatalog = {
  tailored: make('Shirt & trousers', 'male', [shirt, trousers, item('Belt', 'belt'), shoes, item('Watch strap', 'watch')]),
  suit2: make('Two-piece suit', 'male', [item('Suit jacket', 'jacket'), trousers, shirt, item('Tie / pocket square', 'tie'), shoes]),
  suit3: make('Three-piece suit', 'male', [item('Suit jacket', 'jacket'), item('Waistcoat', 'vest'), trousers, shirt, item('Tie / pocket square', 'tie'), shoes]),
  tuxedo: make('Tuxedo', 'male', [item('Dinner jacket', 'jacket'), trousers, item('Dress shirt', 'shirt'), item('Bow tie', 'bow'), shoes]),
  smart: make('Blazer & chinos', 'male', [blazer, item('Chinos', 'trousers'), shirt, item('Belt', 'belt'), shoes]),
  polo: make('Polo & chinos', 'male', [item('Polo shirt', 'polo'), item('Chinos', 'trousers'), item('Light jacket', 'jacket'), shoes]),
  denim: make('T-shirt & jeans', 'male', [item('T-shirt', 'tee'), item('Jeans', 'trousers'), item('Overshirt', 'shirt'), item('Trainers', 'shoes')]),
  knit: make('Knitwear & trousers', 'male', [item('Knit sweater', 'sweater'), trousers, item('Coat', 'coat'), shoes]),
  linen: make('Relaxed linen separates', 'male', [item('Linen shirt', 'shirt'), item('Relaxed trousers', 'trousers'), item('Sandals', 'shoes'), item('Bag', 'bag')]),
  kurta: make('Kurta & trousers', 'male', [item('Kurta', 'tunic'), trousers, item('Waistcoat', 'vest'), shoes, scarf]),
  flowing: make('Blouse & midi skirt', 'female', [item('Blouse', 'blouse'), item('Midi skirt', 'skirt'), bag, shoes]),
  pantsuit: make('Trouser suit', 'female', [blazer, trousers, item('Blouse', 'blouse'), shoes, bag]),
  skirtsuit: make('Skirt suit', 'female', [blazer, item('Skirt', 'skirt'), item('Blouse', 'blouse'), shoes, bag]),
  dressblazer: make('Dress & blazer', 'female', [item('Midi dress', 'dress'), blazer, shoes, bag]),
  midi: make('Midi dress', 'female', [item('Midi dress', 'dress'), item('Cardigan', 'coat'), shoes, bag]),
  gown: make('Evening gown', 'female', [item('Evening gown', 'gown'), item('Wrap', 'scarf'), shoes, item('Clutch', 'bag')]),
  jumpsuit: make('Jumpsuit', 'female', [item('Jumpsuit', 'jumpsuit'), blazer, shoes, bag]),
  separates: make('Top & wide-leg trousers', 'female', [item('Top', 'blouse'), item('Wide-leg trousers', 'widepants'), shoes, bag]),
  skirtknit: make('Knit top & skirt', 'female', [item('Knit top', 'sweater'), item('Skirt', 'skirt'), shoes, bag]),
  denimf: make('Top & jeans', 'female', [item('Top', 'tee'), item('Jeans', 'trousers'), item('Jacket', 'jacket'), item('Trainers', 'shoes'), bag]),
  tunic: make('Tunic & wide-leg trousers', 'female', [item('Tunic', 'tunic'), item('Wide-leg trousers', 'widepants'), scarf, shoes, bag]),
  wrapdress: make('Wrap dress', 'female', [item('Wrap dress', 'wrap'), item('Belt', 'belt'), shoes, bag]),
  traditional: make('Shalwar kameez', 'both', [item('Kameez', 'tunic'), item('Shalwar', 'widepants'), scarf, shoes], { countries: ['PK'], source: 'https://mofa.gov.pk/mazar-e-sharif-culture' }),
  kimono: make('Kimono-inspired color board', 'both', [item('Kimono', 'kimono'), item('Obi / sash', 'belt'), item('Footwear', 'shoes'), item('Bag', 'bag')], { countries: ['JP'], source: 'https://www.japan.travel/en/sg/guide/guide-enjoy-kimono-and-yukata-experience/' }),
  yukata: make('Yukata-inspired color board', 'both', [item('Yukata', 'kimono'), item('Obi / sash', 'belt'), item('Footwear', 'shoes'), item('Bag', 'bag')], { countries: ['JP'], source: 'https://www.japan.travel/en/sg/guide/guide-enjoy-kimono-and-yukata-experience/' }),
  hanbok: make('Hanbok-inspired separates', 'both', [item('Jeogori / upper garment', 'blouse'), item('Skirt or trousers', 'skirt'), item('Ribbon / detail', 'bow'), item('Footwear', 'shoes')], { countries: ['KR'], source: 'https://royal.khs.go.kr/ENG/contents/E701000000.do' }),
  caftan: make('Caftan-inspired color board', 'female', [item('Caftan', 'gown'), item('Belt / detail', 'belt'), item('Footwear', 'shoes'), item('Bag', 'bag')], { countries: ['MA'], source: 'https://www.visitmorocco.com/en/discover-morocco/traditional-craftsmanship-revisited' }),
  custom: make('My own local outfit…', 'both', [], { custom: true })
};
export const wardrobeStyles = Object.fromEntries(Object.entries(wardrobeCatalog).map(([key, value]) => [key, value.label]));
export function availableWardrobes(session) {
  return Object.entries(wardrobeCatalog).filter(([, value]) => value.gender === 'both' || value.gender === session.stylingGender);
}
const recommended = {
  male: { Wedding: ['suit3', 'suit2', 'tuxedo'], Interview: ['suit2', 'tailored', 'smart'], Professional: ['smart', 'knit', 'suit2'], Party: ['tuxedo', 'smart', 'polo'], Casual: ['denim', 'polo', 'linen'], 'Traditional event': ['kurta', 'traditional', 'suit3'] },
  female: { Wedding: ['gown', 'wrapdress', 'jumpsuit'], Interview: ['pantsuit', 'skirtsuit', 'dressblazer'], Professional: ['dressblazer', 'pantsuit', 'separates'], Party: ['jumpsuit', 'gown', 'wrapdress'], Casual: ['denimf', 'skirtknit', 'midi'], 'Traditional event': ['tunic', 'traditional', 'gown'] }
};
export function outfitTemplates(session) {
  const available = availableWardrobes(session), chosen = available.find(([key]) => key === session.wardrobeStyle);
  if (chosen?.[1].custom) {
    const parts = (session.customGarments || []).map((name, index) => item(String(name).trim().slice(0, 40), ['shirt', 'trousers', 'jacket', 'shoes', 'bag'][index])).filter(p => p.role);
    return Array.from({ length: 3 }, () => ({ label: 'Your own outfit', parts }));
  }
  const local = available.filter(([, value]) => value.countries?.includes(session.styleCountry));
  const picks = [...(recommended[session.stylingGender] || recommended.male)[session.occasion] || recommended.male.Casual];
  if (local.length && ['Wedding', 'Traditional event', 'Casual'].includes(session.occasion)) picks[0] = local[session.occasion === 'Casual' ? local.length - 1 : 0][0];
  return (chosen ? [chosen[1], chosen[1], chosen[1]] : picks.map(key => wardrobeCatalog[key])).map(template => {
    if (template === wardrobeCatalog.traditional) return { ...template, parts: [item('Kameez', 'tunic'), item('Shalwar', 'widepants'), session.stylingGender === 'male' ? item('Waistcoat', 'vest') : item('Dupatta', 'scarf'), shoes] };
    if (template === wardrobeCatalog.hanbok) return { ...template, parts: [template.parts[0], session.stylingGender === 'male' ? item('Trousers', 'widepants') : item('Skirt', 'skirt'), ...template.parts.slice(2)] };
    return template;
  });
}
export const effectiveMakeup = s => s.makeupPreference && s.makeupPreference !== 'auto' ? s.makeupPreference : s.stylingGender === 'male' ? 'none' : 'soft';
