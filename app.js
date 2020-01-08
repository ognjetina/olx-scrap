const webscraper = require('web-scraper-js');
const { Client } = require('pg');

const baseUrl = 'https://www.olx.ba/pretraga?vrsta=samoizdavanje&kategorija=23&kanton=15&grad%5B0%5D=1088&stranica=';
const articleDetailsUrl = 'https://www.olx.ba/artikal/';

const createTableQuery = 'CREATE TABLE apartments(id SERIAL PRIMARY KEY, name VARCHAR(200), price VARCHAR(200),link VARCHAR(200));';
const tableExistsQuery = 'SELECT EXISTS(SELECT * FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'apartments\');';

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

	const client = new Client({
		connectionString: process.env.DATABASE_URL,
		ssl: true,
	});

	client.connect();

	client
		.query(tableExistsQuery)
		.then(res => {
				if (!res.rows[0].exists) {
					console.log('Create database!');
					client.query(createTableQuery)
				}
				client.end()
			}
		)
		.catch(e => console.error(e.stack));

})();