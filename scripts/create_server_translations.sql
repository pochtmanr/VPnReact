-- Create the server_translations table
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

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_server_translations_language ON server_translations(language_code);
CREATE INDEX IF NOT EXISTS idx_server_translations_server ON server_translations(server_id);

-- Enable Row Level Security
ALTER TABLE server_translations ENABLE ROW LEVEL SECURITY;

-- Allow public read access
DROP POLICY IF EXISTS "Allow public read access" ON server_translations;
CREATE POLICY "Allow public read access" ON server_translations
  FOR SELECT USING (true);

-- Clear existing translations (if re-running)
DELETE FROM server_translations;

-- ========================================
-- Server Translations for 10 Languages
-- ========================================
-- Languages: es (Spanish), zh (Chinese), hi (Hindi), ar (Arabic), pt (Portuguese),
--            ru (Russian), ja (Japanese), de (German), fa (Persian)
-- Note: English is the base language stored in vpn_servers table

-- Frankfurt, Germany (ID: 3b603345-f251-43f5-b4c9-9f6a26494b33)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'es', 'Fráncfort', 'Alemania'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'zh', '法兰克福', '德国'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'hi', 'फ्रैंकफर्ट', 'जर्मनी'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'ar', 'فرانكفورت', 'ألمانيا'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'pt', 'Frankfurt', 'Alemanha'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'ru', 'Франкфурт', 'Германия'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'ja', 'フランクフルト', 'ドイツ'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'de', 'Frankfurt', 'Deutschland'),
  ('3b603345-f251-43f5-b4c9-9f6a26494b33', 'fa', 'فرانکفورت', 'آلمان');

-- Frankfurt #2, Germany (ID: e462c96b-af8b-4f09-b989-3ad9aec63413)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'es', 'Fráncfort', 'Alemania'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'zh', '法兰克福', '德国'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'hi', 'फ्रैंकफर्ट', 'जर्मनी'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'ar', 'فرانكفورت', 'ألمانيا'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'pt', 'Frankfurt', 'Alemanha'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'ru', 'Франкфурт', 'Германия'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'ja', 'フランクフルト', 'ドイツ'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'de', 'Frankfurt', 'Deutschland'),
  ('e462c96b-af8b-4f09-b989-3ad9aec63413', 'fa', 'فرانکفورت', 'آلمان');

-- New York, United States (ID: 10daffad-863f-42d3-a30a-8f9df6535e72)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'es', 'Nueva York', 'Estados Unidos'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'zh', '纽约', '美国'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'hi', 'न्यूयॉर्क', 'संयुक्त राज्य अमेरिका'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'ar', 'نيويورك', 'الولايات المتحدة'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'pt', 'Nova Iorque', 'Estados Unidos'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'ru', 'Нью-Йорк', 'США'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'ja', 'ニューヨーク', 'アメリカ合衆国'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'de', 'New York', 'Vereinigte Staaten'),
  ('10daffad-863f-42d3-a30a-8f9df6535e72', 'fa', 'نیویورک', 'ایالات متحده');

-- Los Angeles, United States (ID: a0eb4a1d-34b4-400b-bf8b-39ce9283003b)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'es', 'Los Ángeles', 'Estados Unidos'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'zh', '洛杉矶', '美国'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'hi', 'लॉस एंजिल्स', 'संयुक्त राज्य अमेरिका'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'ar', 'لوس أنجلوس', 'الولايات المتحدة'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'pt', 'Los Angeles', 'Estados Unidos'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'ru', 'Лос-Анджелес', 'США'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'ja', 'ロサンゼルス', 'アメリカ合衆国'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'de', 'Los Angeles', 'Vereinigte Staaten'),
  ('a0eb4a1d-34b4-400b-bf8b-39ce9283003b', 'fa', 'لس آنجلس', 'ایالات متحده');

-- London, United Kingdom (ID: 5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'es', 'Londres', 'Reino Unido'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'zh', '伦敦', '英国'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'hi', 'लंदन', 'यूनाइटेड किंगडम'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'ar', 'لندن', 'المملكة المتحدة'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'pt', 'Londres', 'Reino Unido'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'ru', 'Лондон', 'Великобритания'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'ja', 'ロンドン', 'イギリス'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'de', 'London', 'Vereinigtes Königreich'),
  ('5ba3fc6a-102e-4e43-9bbc-0b1bc8914d64', 'fa', 'لندن', 'بریتانیا');

-- Tokyo, Japan (ID: e4f603f0-6661-4a7f-ade3-4ca0e674fd4e)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'es', 'Tokio', 'Japón'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'zh', '东京', '日本'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'hi', 'टोक्यो', 'जापान'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'ar', 'طوكيو', 'اليابان'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'pt', 'Tóquio', 'Japão'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'ru', 'Токио', 'Япония'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'ja', '東京', '日本'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'de', 'Tokio', 'Japan'),
  ('e4f603f0-6661-4a7f-ade3-4ca0e674fd4e', 'fa', 'توکیو', 'ژاپن');

-- Singapore (ID: 88029aac-2c3c-4201-adba-60f2701d7d3a)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'es', 'Singapur', 'Singapur'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'zh', '新加坡', '新加坡'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'hi', 'सिंगापुर', 'सिंगापुर'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'ar', 'سنغافورة', 'سنغافورة'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'pt', 'Singapura', 'Singapura'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'ru', 'Сингапур', 'Сингапур'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'ja', 'シンガポール', 'シンガポール'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'de', 'Singapur', 'Singapur'),
  ('88029aac-2c3c-4201-adba-60f2701d7d3a', 'fa', 'سنگاپور', 'سنگاپور');

-- Sydney, Australia (ID: 66346e9c-c547-4234-bc65-6fda70057708)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('66346e9c-c547-4234-bc65-6fda70057708', 'es', 'Sídney', 'Australia'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'zh', '悉尼', '澳大利亚'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'hi', 'सिडनी', 'ऑस्ट्रेलिया'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'ar', 'سيدني', 'أستراليا'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'pt', 'Sydney', 'Austrália'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'ru', 'Сидней', 'Австралия'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'ja', 'シドニー', 'オーストラリア'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'de', 'Sydney', 'Australien'),
  ('66346e9c-c547-4234-bc65-6fda70057708', 'fa', 'سیدنی', 'استرالیا');

-- Toronto, Canada (ID: 7e8444ee-8f55-4cce-80a0-a0aade9f152e)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'es', 'Toronto', 'Canadá'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'zh', '多伦多', '加拿大'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'hi', 'टोरंटो', 'कनाडा'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'ar', 'تورنتو', 'كندا'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'pt', 'Toronto', 'Canadá'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'ru', 'Торонто', 'Канада'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'ja', 'トロント', 'カナダ'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'de', 'Toronto', 'Kanada'),
  ('7e8444ee-8f55-4cce-80a0-a0aade9f152e', 'fa', 'تورنتو', 'کانادا');

-- Amsterdam, Netherlands (ID: 60767289-46be-4398-90b2-ab590fdc6f20)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'es', 'Ámsterdam', 'Países Bajos'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'zh', '阿姆斯特丹', '荷兰'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'hi', 'एम्स्टर्डम', 'नीदरलैंड'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'ar', 'أمستردام', 'هولندا'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'pt', 'Amsterdã', 'Países Baixos'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'ru', 'Амстердам', 'Нидерланды'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'ja', 'アムステルダム', 'オランダ'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'de', 'Amsterdam', 'Niederlande'),
  ('60767289-46be-4398-90b2-ab590fdc6f20', 'fa', 'آمستردام', 'هلند');

-- Zurich, Switzerland (ID: 41dd4379-c5a6-4d16-bc26-898079ca62a5)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'es', 'Zúrich', 'Suiza'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'zh', '苏黎世', '瑞士'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'hi', 'ज्यूरिख', 'स्विट्जरलैंड'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'ar', 'زيورخ', 'سويسرا'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'pt', 'Zurique', 'Suíça'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'ru', 'Цюрих', 'Швейцария'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'ja', 'チューリッヒ', 'スイス'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'de', 'Zürich', 'Schweiz'),
  ('41dd4379-c5a6-4d16-bc26-898079ca62a5', 'fa', 'زوریخ', 'سوئیس');

-- Stockholm, Sweden (ID: 833466ed-9bed-4a12-b4c5-2d6834aca8ea)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'es', 'Estocolmo', 'Suecia'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'zh', '斯德哥尔摩', '瑞典'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'hi', 'स्टॉकहोम', 'स्वीडन'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'ar', 'ستوكهولم', 'السويد'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'pt', 'Estocolmo', 'Suécia'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'ru', 'Стокгольм', 'Швеция'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'ja', 'ストックホルム', 'スウェーデン'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'de', 'Stockholm', 'Schweden'),
  ('833466ed-9bed-4a12-b4c5-2d6834aca8ea', 'fa', 'استکهلم', 'سوئد');

-- Paris, France (ID: 13e423cc-9374-4a65-9835-8058687ffdfd)
INSERT INTO server_translations (server_id, language_code, city_name, country_name) VALUES
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'es', 'París', 'Francia'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'zh', '巴黎', '法国'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'hi', 'पेरिस', 'फ्रांस'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'ar', 'باريس', 'فرنسا'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'pt', 'Paris', 'França'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'ru', 'Париж', 'Франция'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'ja', 'パリ', 'フランス'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'de', 'Paris', 'Frankreich'),
  ('13e423cc-9374-4a65-9835-8058687ffdfd', 'fa', 'پاریس', 'فرانسه');

-- Verify the data
SELECT
  st.language_code,
  st.city_name,
  st.country_name,
  vs.city as original_city,
  vs.country as original_country
FROM server_translations st
JOIN vpn_servers vs ON st.server_id = vs.id
WHERE vs.city = 'Frankfurt'
ORDER BY st.language_code;
