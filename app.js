const webscraper = require('web-scraper-js');

const baseUrl = 'https://www.olx.ba/pretraga?vrsta=samoizdavanje&kategorija=23&kanton=15&grad%5B0%5D=1088&stranica=';
const articleDetailsUrl = 'https://www.olx.ba/artikal/';

(async () => {

	let pagesData = await webscraper.scrape({
		url: baseUrl,
		tags: {
			text: {
				result: '.stranice a'
			}
		}
	});

	const pages = pagesData.result.filter(Boolean);

	let articles = await Promise.all(
		pages.map(async page => {
			let result = await webscraper.scrape({
				url: baseUrl + page,
				tags: {
					text: {
						'name': '.artikal p.na',
						'price': 'div .datum span',
					},
					attribute: {
						'link': ['.artikal', 'id'],
					}
				}
			});

			return result.name.map((name, i) => {
				return {
					id: result.link[i] && result.link[i].substring(4),
					name: name,
					price: result.price[i],
					link: result.link[i] && articleDetailsUrl + result.link[i].substring(4)
				}
			})

		})
	).then(result => result.flat().filter(article => article.id))

	console.log(articles.length,);
	console.log('ARTICLES;;', articles);

})();