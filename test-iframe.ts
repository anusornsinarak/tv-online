import fetch from 'node-fetch';
import * as cheerio from 'cheerio';

async function test() {
  const nonce = '2a3ec2ad14'; // we might need to get this from the page
  const res = await fetch('https://www.123-hds.com/wp-content/themes/halimmovies_54/halim-ajax.php', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'User-Agent': 'Mozilla/5.0'
    },
    body: 'action=halim_ajax_player&episode=0&server=1&post_id=150807&nonce=' + nonce
  });
  console.log(await res.text());
}
test();

