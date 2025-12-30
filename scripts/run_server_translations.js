/**
 * Script to populate server_translations table in Supabase
 * Run with: SUPABASE_URL="..." SUPABASE_SERVICE_KEY="..." node scripts/run_server_translations.js
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL || 'https://fzlrhmjdjjzcgstaeblu.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

if (!supabaseServiceKey) {
  console.error('Error: SUPABASE_SERVICE_KEY environment variable is required');
  console.error('Usage: SUPABASE_SERVICE_KEY="your-service-key" node scripts/run_server_translations.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Server IDs mapped to their cities
const servers = {
  'Frankfurt': '3b603345-f251-43f5-b4c9-9f6a26494b33',
  'Frankfurt #2': 'e462c96b-af8b-4f09-b989-3ad9aec63413',
  'New York': '10daffad-863f-42d3-a30a-8f9df6535e72',
  'Los Angeles': 'a0eb4a1d-34b4-400b-bf8b-39ce9283003b',
  'London': '5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64',
  'Tokyo': 'e4f603f0-6661-4a7f-ade3-4ca0e674fd4e',
  'Singapore': '88029aac-2c3c-4201-adba-60f2701d7d3a',
  'Sydney': '66346e9c-c547-4234-bc65-6fda70057708',
  'Toronto': '7e8444ee-8f55-4cce-80a0-a0aade9f152e',
  'Amsterdam': '60767289-46be-4398-90b2-ab590fdc6f20',
  'Zurich': '41dd4379-c5a6-4d16-bc26-898079ca62a5',
  'Stockholm': '833466ed-9bed-4a12-b4c5-2d6834aca8ea',
  'Paris': '13e423cc-9374-4a65-9835-8058687ffdfd',
};

// Translations for each server in 9 languages (excluding English base)
const translations = {
  'Frankfurt': {
    es: { city: 'Fráncfort', country: 'Alemania' },
    zh: { city: '法兰克福', country: '德国' },
    hi: { city: 'फ्रैंकफर्ट', country: 'जर्मनी' },
    ar: { city: 'فرانكفورت', country: 'ألمانيا' },
    pt: { city: 'Frankfurt', country: 'Alemanha' },
    ru: { city: 'Франкфурт', country: 'Германия' },
    ja: { city: 'フランクフルト', country: 'ドイツ' },
    de: { city: 'Frankfurt', country: 'Deutschland' },
    fa: { city: 'فرانکفورت', country: 'آلمان' },
  },
  'Frankfurt #2': {
    es: { city: 'Fráncfort', country: 'Alemania' },
    zh: { city: '法兰克福', country: '德国' },
    hi: { city: 'फ्रैंकफर्ट', country: 'जर्मनी' },
    ar: { city: 'فرانكفورت', country: 'ألمانيا' },
    pt: { city: 'Frankfurt', country: 'Alemanha' },
    ru: { city: 'Франкфурт', country: 'Германия' },
    ja: { city: 'フランクフルト', country: 'ドイツ' },
    de: { city: 'Frankfurt', country: 'Deutschland' },
    fa: { city: 'فرانکفورت', country: 'آلمان' },
  },
  'New York': {
    es: { city: 'Nueva York', country: 'Estados Unidos' },
    zh: { city: '纽约', country: '美国' },
    hi: { city: 'न्यूयॉर्क', country: 'संयुक्त राज्य अमेरिका' },
    ar: { city: 'نيويورك', country: 'الولايات المتحدة' },
    pt: { city: 'Nova Iorque', country: 'Estados Unidos' },
    ru: { city: 'Нью-Йорк', country: 'США' },
    ja: { city: 'ニューヨーク', country: 'アメリカ合衆国' },
    de: { city: 'New York', country: 'Vereinigte Staaten' },
    fa: { city: 'نیویورک', country: 'ایالات متحده' },
  },
  'Los Angeles': {
    es: { city: 'Los Ángeles', country: 'Estados Unidos' },
    zh: { city: '洛杉矶', country: '美国' },
    hi: { city: 'लॉस एंजिल्स', country: 'संयुक्त राज्य अमेरिका' },
    ar: { city: 'لوس أنجلوس', country: 'الولايات المتحدة' },
    pt: { city: 'Los Angeles', country: 'Estados Unidos' },
    ru: { city: 'Лос-Анджелес', country: 'США' },
    ja: { city: 'ロサンゼルス', country: 'アメリカ合衆国' },
    de: { city: 'Los Angeles', country: 'Vereinigte Staaten' },
    fa: { city: 'لس آنجلس', country: 'ایالات متحده' },
  },
  'London': {
    es: { city: 'Londres', country: 'Reino Unido' },
    zh: { city: '伦敦', country: '英国' },
    hi: { city: 'लंदन', country: 'यूनाइटेड किंगडम' },
    ar: { city: 'لندن', country: 'المملكة المتحدة' },
    pt: { city: 'Londres', country: 'Reino Unido' },
    ru: { city: 'Лондон', country: 'Великобритания' },
    ja: { city: 'ロンドン', country: 'イギリス' },
    de: { city: 'London', country: 'Vereinigtes Königreich' },
    fa: { city: 'لندن', country: 'بریتانیا' },
  },
  'Tokyo': {
    es: { city: 'Tokio', country: 'Japón' },
    zh: { city: '东京', country: '日本' },
    hi: { city: 'टोक्यो', country: 'जापान' },
    ar: { city: 'طوكيو', country: 'اليابان' },
    pt: { city: 'Tóquio', country: 'Japão' },
    ru: { city: 'Токио', country: 'Япония' },
    ja: { city: '東京', country: '日本' },
    de: { city: 'Tokio', country: 'Japan' },
    fa: { city: 'توکیو', country: 'ژاپن' },
  },
  'Singapore': {
    es: { city: 'Singapur', country: 'Singapur' },
    zh: { city: '新加坡', country: '新加坡' },
    hi: { city: 'सिंगापुर', country: 'सिंगापुर' },
    ar: { city: 'سنغافورة', country: 'سنغافورة' },
    pt: { city: 'Singapura', country: 'Singapura' },
    ru: { city: 'Сингапур', country: 'Сингапур' },
    ja: { city: 'シンガポール', country: 'シンガポール' },
    de: { city: 'Singapur', country: 'Singapur' },
    fa: { city: 'سنگاپور', country: 'سنگاپور' },
  },
  'Sydney': {
    es: { city: 'Sídney', country: 'Australia' },
    zh: { city: '悉尼', country: '澳大利亚' },
    hi: { city: 'सिडनी', country: 'ऑस्ट्रेलिया' },
    ar: { city: 'سيدني', country: 'أستراليا' },
    pt: { city: 'Sydney', country: 'Austrália' },
    ru: { city: 'Сидней', country: 'Австралия' },
    ja: { city: 'シドニー', country: 'オーストラリア' },
    de: { city: 'Sydney', country: 'Australien' },
    fa: { city: 'سیدنی', country: 'استرالیا' },
  },
  'Toronto': {
    es: { city: 'Toronto', country: 'Canadá' },
    zh: { city: '多伦多', country: '加拿大' },
    hi: { city: 'टोरंटो', country: 'कनाडा' },
    ar: { city: 'تورنتو', country: 'كندا' },
    pt: { city: 'Toronto', country: 'Canadá' },
    ru: { city: 'Торонто', country: 'Канада' },
    ja: { city: 'トロント', country: 'カナダ' },
    de: { city: 'Toronto', country: 'Kanada' },
    fa: { city: 'تورنتو', country: 'کانادا' },
  },
  'Amsterdam': {
    es: { city: 'Ámsterdam', country: 'Países Bajos' },
    zh: { city: '阿姆斯特丹', country: '荷兰' },
    hi: { city: 'एम्स्टर्डम', country: 'नीदरलैंड' },
    ar: { city: 'أمستردام', country: 'هولندا' },
    pt: { city: 'Amsterdã', country: 'Países Baixos' },
    ru: { city: 'Амстердам', country: 'Нидерланды' },
    ja: { city: 'アムステルダム', country: 'オランダ' },
    de: { city: 'Amsterdam', country: 'Niederlande' },
    fa: { city: 'آمستردام', country: 'هلند' },
  },
  'Zurich': {
    es: { city: 'Zúrich', country: 'Suiza' },
    zh: { city: '苏黎世', country: '瑞士' },
    hi: { city: 'ज्यूरिख', country: 'स्विट्जरलैंड' },
    ar: { city: 'زيورخ', country: 'سويسرا' },
    pt: { city: 'Zurique', country: 'Suíça' },
    ru: { city: 'Цюрих', country: 'Швейцария' },
    ja: { city: 'チューリッヒ', country: 'スイス' },
    de: { city: 'Zürich', country: 'Schweiz' },
    fa: { city: 'زوریخ', country: 'سوئیس' },
  },
  'Stockholm': {
    es: { city: 'Estocolmo', country: 'Suecia' },
    zh: { city: '斯德哥尔摩', country: '瑞典' },
    hi: { city: 'स्टॉकहोम', country: 'स्वीडन' },
    ar: { city: 'ستوكهولم', country: 'السويد' },
    pt: { city: 'Estocolmo', country: 'Suécia' },
    ru: { city: 'Стокгольм', country: 'Швеция' },
    ja: { city: 'ストックホルム', country: 'スウェーデン' },
    de: { city: 'Stockholm', country: 'Schweden' },
    fa: { city: 'استکهلم', country: 'سوئد' },
  },
  'Paris': {
    es: { city: 'París', country: 'Francia' },
    zh: { city: '巴黎', country: '法国' },
    hi: { city: 'पेरिस', country: 'फ्रांस' },
    ar: { city: 'باريس', country: 'فرنسا' },
    pt: { city: 'Paris', country: 'França' },
    ru: { city: 'Париж', country: 'Франция' },
    ja: { city: 'パリ', country: 'フランス' },
    de: { city: 'Paris', country: 'Frankreich' },
    fa: { city: 'پاریس', country: 'فرانسه' },
  },
};

async function createTable() {
  console.log('Note: Table creation requires running SQL in Supabase Dashboard.');
  console.log('Please run the following SQL in your Supabase SQL Editor first:\n');
  console.log(`
CREATE TABLE IF NOT EXISTS server_translations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID NOT NULL REFERENCES vpn_servers(id) ON DELETE CASCADE,
  language_code VARCHAR(5) NOT NULL,
  city_name VARCHAR(100) NOT NULL,
  country_name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(server_id, language_code)
);

CREATE INDEX IF NOT EXISTS idx_server_translations_language ON server_translations(language_code);
CREATE INDEX IF NOT EXISTS idx_server_translations_server ON server_translations(server_id);

ALTER TABLE server_translations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public read access" ON server_translations;
CREATE POLICY "Allow public read access" ON server_translations FOR SELECT USING (true);
  `);
}

async function populateTranslations() {
  console.log('\n--- Populating Server Translations ---\n');

  // Build all translation records
  const records = [];
  for (const [serverName, serverId] of Object.entries(servers)) {
    const serverTranslations = translations[serverName];
    if (!serverTranslations) continue;

    for (const [langCode, trans] of Object.entries(serverTranslations)) {
      records.push({
        server_id: serverId,
        language_code: langCode,
        city_name: trans.city,
        country_name: trans.country,
      });
    }
  }

  console.log(`Inserting ${records.length} translation records...`);

  // Delete existing translations first
  const { error: deleteError } = await supabase
    .from('server_translations')
    .delete()
    .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all

  if (deleteError && !deleteError.message.includes('does not exist')) {
    console.error('Error clearing existing translations:', deleteError.message);
  }

  // Insert all records
  const { data, error } = await supabase
    .from('server_translations')
    .insert(records)
    .select();

  if (error) {
    if (error.message.includes('does not exist')) {
      console.error('\nError: The server_translations table does not exist.');
      await createTable();
      return;
    }
    console.error('Error inserting translations:', error.message);
    return;
  }

  console.log(`Successfully inserted ${data.length} translations!`);

  // Verify by fetching Frankfurt translations
  const { data: frankfurtTrans, error: fetchError } = await supabase
    .from('server_translations')
    .select('language_code, city_name, country_name')
    .eq('server_id', servers['Frankfurt'])
    .order('language_code');

  if (fetchError) {
    console.error('Error fetching verification data:', fetchError.message);
    return;
  }

  console.log('\n--- Frankfurt Server Translations ---');
  console.table(frankfurtTrans);
}

populateTranslations().catch(console.error);
