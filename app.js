const webscraper = require('web-scraper-js');
const { Client } = require('pg');
const sgMail = require('@sendgrid/mail');

const baseUrl = 'https://www.olx.ba/pretraga?vrsta=samoizdavanje&kategorija=23&kanton=15&grad%5B0%5D=1088&stranica=';
const articleDetailsUrl = 'https://www.olx.ba/artikal/';

const createTableQuery = 'CREATE TABLE apartments(id SERIAL PRIMARY KEY, name VARCHAR(200), price VARCHAR(200),link VARCHAR(200));';
const tableExistsQuery = 'SELECT EXISTS(SELECT * FROM information_schema.tables WHERE table_schema = \'public\' AND table_name = \'apartments\');';

sgMail.setApiKey(process.env.SENDGRID_API_KEY);

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

	let scrapedApartments = await Promise.all(
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

	await deleteApartments(client);


	await client
		.query(tableExistsQuery)
		.then(res => {
				if (!res.rows[0].exists) {
					console.log('Create apartment table!');
					client.query(createTableQuery)
				} else {
					console.log('Table apartment exists!');
				}

			}
		)
		.catch(e => console.error(e.stack));


	const currentApartments = await getApartments(client);

	const newApartments = xorBy(currentApartments, scrapedApartments, 'id');

	console.log('scraped apartments length:', scrapedApartments.length);
	console.log('current apartments length:', currentApartments.length);
	console.log('new apartments length:', newApartments.length);
	//TODO send intersection via email!

	if (newApartments.length) {
		sendEmail(newApartments);
	}
	
	await Promise.all(
		scrapedApartments.map(async apartment => {
			await updateApartment(client, apartment)
		})
	).catch();

	client.end()

})();

const updateApartment = async (client, apartment) => {
	await client.query(`INSERT INTO apartments (id, name, price, link) values (\'${apartment.id}\',\'${apartment.name}\',\'${apartment.price}\',\'${apartment.link}\') ON CONFLICT (id) DO UPDATE SET name = \'${apartment.name}\', price=\'${apartment.price}\',link=\'${apartment.link}\';`).catch();
};

const getApartments = async client => {
	return await client.query('SELECT * FROM apartments;').then(res => res.rows.map(apartment => {
		return {
			id: String(apartment.id),
			name: apartment.name,
			price: apartment.price,
			link: apartment.link
		}
	})).catch();
};

const deleteApartments = async client => {
	await client.query('TRUNCATE apartments;').catch();
};

const xorBy = (currentApartments, scrapedApartments, fieldName) => {
	if (currentApartments.length < 1) {
		return scrapedApartments
	} else {
		const fn = it => it[fieldName];
		const compareSet = new Set(scrapedApartments.map(fn));
		return currentApartments.map(fn).filter(el => !compareSet.has(el));
	}
};

const sendEmail = (newApartments) => {

		const msg = {
			to: 'laogdo@gmail.com',
			from: 'laogdo@gmail.com',
			subject: 'We found new apartments, check it out!',
			html: `Here is the list of new apartments: <ul>${newApartments.map(apartment => `<li>${apartment.link}</li>`)}</ul>`
		};
		sgMail.send(msg);
	}
;