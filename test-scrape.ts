import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function test() {
  try {
    const res = await fetch('https://www.24hd.net/black-mirror-bandersnatch-2018', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });
    const html = await res.text();
    const $ = cheerio.load(html);
    console.log('--- Page Title ---');
    console.log($('title').text());
    
    console.log('\n--- Checking noscript content ---');
    $('noscript').each((i, el) => {
       console.log(`Noscript ${i} content:`, $(el).html());
    });

  } catch (e) {
    console.error(e);
  }
}

test();
