import puppeteer, { Browser, Page } from 'puppeteer';
import clipboardy from 'clipboardy'; // Using import now
import { PlayerData, Selectors } from './types'; // Assuming you have a types.ts file for type definitions

async function scrapePlayerStats(browser: Browser, url: string, index: number) {
	const page = await browser.newPage();
	const playerName = extractPlayerId(url);

	// log out the url and the index
	console.log(`${index}: ${playerName}: Navigating to: ${url}`);

	const qmMmrSelector =
		'#app > div:nth-child(8) > div:nth-child(4) > div:nth-child(5) > div.mx-auto > div:nth-child(1) > div:nth-child(4) > div > div';
	const slMmrSelector =
		'#app > div:nth-child(8) > div:nth-child(4) > div:nth-child(5) > div.mx-auto > div:nth-child(5) > div:nth-child(4) > div > div';
	const gameTypeDropdown = '#app > div:nth-child(8) > div:nth-child(2) > div:nth-child(1) > div > span:nth-child(2)';
	const qmGameTypeSelector = '#qm';
	const slGameTypeSelector = '#sl';
	const filterButton = '#app > div:nth-child(8) > div.flex.justify-center.mx-auto > button';
	const winsSelector =
		'#app > div:nth-child(8) > div:nth-child(4) > div.flex.md\\:p-20.gap-10.mx-auto.justify-center.items-between.max-md\\:flex-col.max-md\\:items-center > div.flex-1.flex.flex-wrap.justify-between.max-w-\\[400px\\].w-full.items-between.mt-\\[1em\\].max-md\\:order-1 > div:nth-child(1) > div > div';
	const lossesSelector =
		'#app > div:nth-child(8) > div:nth-child(4) > div.flex.md\\:p-20.gap-10.mx-auto.justify-center.items-between.max-md\\:flex-col.max-md\\:items-center > div.flex-1.flex.flex-wrap.justify-between.max-w-\\[400px\\].w-full.items-between.mt-\\[1em\\].max-md\\:order-1 > div:nth-child(2) > div > div';
	const noDataSelector =
		'#app > div:nth-child(8) > div.flex.md\\:p-20.gap-10.mx-auto.justify-center.items-between > div > span';
	const selectors: Selectors = {
		qmMmrSelector,
		slMmrSelector,
		gameTypeDropdown,
		qmGameTypeSelector,
		slGameTypeSelector,
		filterButton,
		winsSelector,
		lossesSelector,
		noDataSelector,
	};

	try {
		let qmMmr = 'None';
		let slMmr = 'None';
		// close the page
		let attempts = 0;
		const maxAttempts = 5;
		while (attempts < maxAttempts) {
			try {
				attempts++;
				await page.goto(url);
				await page.waitForNetworkIdle();
				await page.waitForSelector(selectors.qmMmrSelector, { timeout: 4 * 60000 }); // Wait up to 60 seconds
				qmMmr = (
					await page.$eval(selectors.qmMmrSelector, el => el?.textContent?.trim() ?? 'None').catch(() => 'None')
				).replace(/,/g, '');
				slMmr = (
					await page.$eval(selectors.slMmrSelector, el => el?.textContent?.trim() ?? 'None').catch(() => 'None')
				).replace(/,/g, '');
			} catch (error: any) {
				if (error.name === 'TimeoutError') {
					console.log(`${index}: Timeout while waiting for MMR selectors.`);
				} else {
					console.error(`${index}: Error fetching MMR data: ${error.message}`);
				}
			}
		}
		console.log(`${index} MMR: ${playerName}: QM MMR: ${qmMmr}, SL MMR: ${slMmr}`);
		await page.setViewport({ width: 1920, height: 1080 });

		// call the get games function
		const { games: qmGames, wins: qmWins, losses: qmLosses } = await getGames(playerName, page, selectors, 'qm', index);
		console.log(`${index} QM: ${playerName}: QM Games: ${qmGames} = ${qmWins} + ${qmLosses}`);

		// call the get games function
		const { games: slGames, wins: slWins, losses: slLosses } = await getGames(playerName, page, selectors, 'sl', index);
		console.log(`${index} SL: ${playerName}: SL Games: ${slGames} = ${slWins} + ${slLosses}`);

		await page.close();
		return { qmMmr, slMmr, qmGames, slGames };
	} catch (error: any) {
		// show the line number and the error message
		console.error(`${index}: ${playerName}: Error scraping data for ${url}: ${error.message}`);
		console.error(error);
		await page.close();
		return { qmMmr: 'Error', slMmr: 'Error', qmGames: 'Error', slGames: 'Error' };
	}
}

function extractPlayerId(url: string) {
	const playerRegex = /(?:Player\/([^/]+)\/\d+\/|battletag\/searched\/([^%#]+)(?:%23|#)\d+\/alt)/;
	const match = RegExp(playerRegex).exec(url);

	if (match?.[1]) {
		return match[1]; // Player name from /Player/
	} else if (match?.[2]) {
		return match[2]; // Battletag name before the #
	} else {
		console.error(`No player ID found in URL: ${url}`);
		return '';
	}
}

/**
 * fetches the number of wins and losses for the current player
 * @param {string} playerId - The player ID to be used in the screenshot filename.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {Selectors} selectors - The selectors object containing the CSS selectors for the page elements.
 * @param {'qm' | 'sl'} label - The game type label ('qm' for Quick Match, 'sl' for Storm League).
 * @param {number} index - The index of the player in the list.
 * @returns {Promise<{games: number;wins: number;losses: number;}>} - An object containing the number of games, wins, and losses.
 */
async function getGames(
	playerId: string,
	page: Page,
	selectors: Selectors,
	label: 'qm' | 'sl',
	index: number
): Promise<{ games: number; wins: number; losses: number }> {
	// run this up to 5 times max
	let attempts = 0;
	const maxAttempts = 5;
	while (attempts < maxAttempts) {
		try {
			attempts++;
			await page.click(selectors.gameTypeDropdown);
			await page.waitForSelector(selectors[`${label}GameTypeSelector`], { timeout: 60000 }); // Wait up to 60 seconds
			await page.click(selectors[`${label}GameTypeSelector`]);

			await page.click(selectors.filterButton);
			await Promise.race([
				page.waitForSelector(selectors.winsSelector, { timeout: 4 * 60000 }), // Wait up to 60 seconds
				page.waitForSelector(selectors.noDataSelector, { timeout: 4 * 60000 }), // Wait up to 60 seconds
			]);
			break;
		} catch (error: any) {
			attempts++;
			console.log(`${index}: Attempt ${attempts} failed. Retrying...`);
			if (error.name === 'TimeoutError') {
				console.log(`${index}: Timeout while waiting for wins selector.`);
			} else {
				console.error(`${index}: Error fetching wins data: ${error.message}`);
			}
		}
	}

	await page.screenshot({ path: `./screenshots/screenshot_${playerId}_${label.toUpperCase()}.png` });
	// wait for the QM games to load
	let wins =
		parseInt(
			(await page.$eval(selectors.winsSelector, el => el.textContent?.trim() ?? 'None').catch(() => 'None')).replace(
				/,/g,
				''
			)
		) || 0;
	let losses =
		parseInt(
			(await page.$eval(selectors.lossesSelector, el => el?.textContent?.trim() ?? 'None').catch(() => 'None')).replace(
				/,/g,
				''
			)
		) || 0;

	const games = wins === 0 && losses === 0 ? -1 : wins + losses;
	return { games, wins, losses };
}

/**
 * Processes an array of tasks with a concurrency limit.
 * @param {puppeteer.Browser} browser - The Puppeteer browser instance.
 * @param {Array<string>} urls - An array of URLs to process.
 * @param {number} concurrencyLimit - The maximum number of concurrent tasks.
 * @returns {Promise<Array>} - A promise that resolves to an array of results.
 */
async function processWithConcurrency(
	browser: Browser,
	urls: string[],
	concurrencyLimit: number = 10
): Promise<Array<any>> {
	const results: PlayerData[] = [];
	let taskIndex = 0;

	const runNext = async () => {
		if (taskIndex >= urls.length) return;
		const currentIndex = taskIndex++;
		try {
			const result = await scrapePlayerStats(browser, urls[currentIndex], currentIndex);
			results[currentIndex] = result;
		} catch (error: any) {
			console.error(`Error processing URL at index ${currentIndex}: ${error.message}`);
			results[currentIndex] = { qmMmr: 'Error', slMmr: 'Error', qmGames: 'Error', slGames: 'Error' };
		}
		await runNext(); // Recursively kick off the next task
	};

	// Start the concurrent workers
	const workers = Array(Math.min(concurrencyLimit, urls.length))
		.fill(0)
		.map(() => runNext());

	return await Promise.all(workers).then(() => results);
}

/**
 * gets the player stats for a single player, without concurrency
 * @param browser
 * @param playerUrls
 * @returns
 */
async function processWithoutConcurrency(browser: Browser, playerUrls: string[]): Promise<PlayerData[]> {
	const allStatsProm = playerUrls.map((url, index) => {
		// call the scrapePlayerStats function for each url
		return scrapePlayerStats(browser, url, index);
	});
	return Promise.all(allStatsProm);
}

async function main() {
	try {
		// if the screenshots directory doesn't exist, create it
		const fs = require('fs');
		const dir = './screenshots';
		if (!fs.existsSync(dir)) {
			fs.mkdirSync(dir);
		}
		// keep track of the time, so we can see how long it took to run the script
		const startTime = Date.now();
		// read the clipboard
		const clipboardText = await clipboardy.read(); // Read from clipboard
		// use this for testing
		// const clipboardText = 'https://www.heroesprofile.com/Player/JimmyBobJoe/8034886/1';
		// testing with multiple players
		// 		const clipboardText = `https://www.heroesprofile.com/battletag/searched/Aieeeǃ%231679/alt
		// https://www.heroesprofile.com/battletag/searched/Akuma%2315567/alt
		// https://www.heroesprofile.com/Player/Alpharak/9691835/1
		// https://www.heroesprofile.com/battletag/searched/Amarandus%231357/alt
		// https://www.heroesprofile.com/battletag/searched/Ambama%231981/alt
		// https://www.heroesprofile.com/Player/AOERules/690109/1
		// https://www.heroesprofile.com/battletag/searched/Auslesejager%231855/alt
		// https://www.heroesprofile.com/Player/Aviater/10575601/1
		// https://www.heroesprofile.com/battletag/searched/B4bystomper%231878/alt
		// https://www.heroesprofile.com/Player/Babywhale/6618305/1
		// https://www.heroesprofile.com/battletag/searched/Bandayd%231631/alt
		// https://www.heroesprofile.com/battletag/searched/Basileus%2311887/alt
		// https://www.heroesprofile.com/battletag/searched/beefprime%231974/alt
		// https://www.heroesprofile.com/Player/Bloodlust/8369497/1
		// https://www.heroesprofile.com/battletag/searched/Bowsette%231610/alt
		// https://www.heroesprofile.com/battletag/searched/Carreba%231174/alt
		// https://www.heroesprofile.com/Player/Cavela/1111166/1
		// https://www.heroesprofile.com/battletag/searched/Cav%2311360/alt
		// https://www.heroesprofile.com/battletag/searched/ChairGlue%231201/alt
		// https://www.heroesprofile.com/Player/Chandro/9078714/1`;
		const playerUrls = clipboardText
			.split('\n')
			.map(id => id.trim())
			.filter(id => id !== '');

		if (playerUrls.length === 0) {
			console.log('No player IDs found on the clipboard.');
			return;
		}

		// check that all playerUrls are valid
		const invalidUrls = playerUrls.filter(url => !url.startsWith('http'));
		if (invalidUrls.length > 0) {
			console.error('Invalid URLs found:');
			invalidUrls.forEach(url => console.error(url));
			return;
		} else {
			console.log('loading:');
			console.log(`${clipboardText.split('\n').length} players`);
			console.log(clipboardText);
			console.log('');
		}

		const browser = await puppeteer.launch({ headless: true });

		const enableConcurrency = true; // Set to true to enable concurrency
		const allStats = enableConcurrency
			? await processWithConcurrency(browser, playerUrls, 5)
			: await processWithoutConcurrency(browser, playerUrls); // Adjust concurrency limit as needed

		await browser.close();

		if (allStats.length > 0) {
			const output = allStats
				.map(stats => `${stats.qmMmr}\t ${stats.slMmr}\t ${stats.qmGames}\t ${stats.slGames}`)
				.join('\n');
			console.log(`Scraped data:\n${output}`);
			await clipboardy.write(output); // Using clipboardy directly now
			console.log('Scraped data copied to clipboard.');
		} else {
			console.log('No data scraped.');
		}
		const endTime = Date.now();
		const elapsedTime = ((endTime - startTime) / 1000).toFixed(2);
		console.log(`Elapsed time: ${elapsedTime} seconds`);
	} catch (error) {
		console.error('An error occurred:', error);
	}
}

main();
