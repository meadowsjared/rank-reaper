import puppeteer from 'puppeteer';
import clipboardy from 'clipboardy'; // Using import now

async function scrapePlayerStats(browser, url, index) {
	// const localBrowser = await puppeteer.launch({ headless: 'new' });
	const page = await browser.newPage();
	const playerName = extractPlayerId(url);

	// log out the url and the index
	console.log(`${index}: ${playerName}: Navigating to: ${url}`);
	await page.goto(url, { waitUntil: 'networkidle2' });
	// console.log(`${index}: URL parts: ${urlParts}`);
	// const playerId = urlParts[3] === 'Player' ? urlParts[4] : urlParts[5];

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

	try {
		let qmMmr = 'None';
		let slMmr = 'None';
		// close the page
		try {
			await page.waitForSelector(qmMmrSelector, { timeout: 4 * 60000 }); // Wait up to 60 seconds
			qmMmr = (await page.$eval(qmMmrSelector, el => el.textContent.trim()).catch(() => 'None')).replace(/,/g, '');
			slMmr = (await page.$eval(slMmrSelector, el => el.textContent.trim()).catch(() => 'None')).replace(/,/g, '');
		} catch (error) {
			if (error.name === 'TimeoutError') {
				console.log('Timeout while waiting for MMR selectors.');
			} else {
				console.error(`Error fetching MMR data: ${error.message}`);
			}
		}
		console.log(`${index} MMR: ${playerName}: QM MMR: ${qmMmr}, SL MMR: ${slMmr}`);
		await page.setViewport({ width: 1920, height: 1080 });

		//TODO call the get games function
		const {
			games: qmGames,
			wins: qmWins,
			losses: qmLosses,
		} = await getGames(
			playerName,
			page,
			gameTypeDropdown,
			qmGameTypeSelector,
			filterButton,
			winsSelector,
			lossesSelector,
			noDataSelector,
			'QM',
			index
		);
		console.log(`${index} QM: ${playerName}: QM Games: ${qmGames} = ${qmWins} + ${qmLosses}`);

		//TODO call the get games function
		const {
			games: slGames,
			wins: slWins,
			losses: slLosses,
		} = await getGames(
			playerName,
			page,
			gameTypeDropdown,
			slGameTypeSelector,
			filterButton,
			winsSelector,
			lossesSelector,
			noDataSelector,
			'SL',
			index
		);
		console.log(`${index} SL: ${playerName}: SL Games: ${slGames} = ${slWins} + ${slLosses}`);

		await page.close();
		return { qmMmr, slMmr, qmGames, slGames };
	} catch (error) {
		// show the line number and the error message
		console.error(`${index}: ${playerName}: Error scraping data for ${url}: ${error.message}`);
		console.error(error);
		await page.close();
		return { qmMmr: 'Error', slMmr: 'Error', qmGames: 'Error', slGames: 'Error' };
	}
}

function extractPlayerId(url) {
	const playerRegex = /(?:Player\/([^/]+)\/\d+\/|battletag\/searched\/([^%#]+)(?:%23|#)\d+\/alt)/;
	const match = url.match(playerRegex);

	if (match && match[1]) {
		return match[1]; // Player name from /Player/
	} else if (match && match[2]) {
		return match[2]; // Battletag name before the #
	}
}

/**
 * fetches the number of wins and losses for the current player
 *
 * @param {string} playerId - The player ID to be used in the screenshot filename.
 * @param {puppeteer.Page} page - The Puppeteer page instance.
 * @param {string} gameTypeDropdown - The selector for the game type dropdown.
 * @param {string} gameTypeSelector - The selector for the game type option.
 * @param {string} filterButton - The selector for the filter button.
 * @param {string} winsSelector - The selector for the wins element.
 * @param {string} lossesSelector - The selector for the losses element.
 * @param {string} noDataSelector - The selector for the no data element.
 * @param {string} label - A label to identify the game type (e.g., 'QM' or 'SL').
 * @param {number} index - The index of the player in the list.
 * @returns {Promise<{ games: number, wins: number, losses: number }>} - An object containing the number of games, wins, and losses.
 */
async function getGames(
	playerId,
	page,
	gameTypeDropdown,
	gameTypeSelector,
	filterButton,
	winsSelector,
	lossesSelector,
	noDataSelector,
	label,
	index
) {
	// run this up to 5 times max
	let attempts = 0;
	const maxAttempts = 5;
	while (attempts < maxAttempts) {
		try {
			// console.log(`${index}: awaiting gameTypeDropdown`);
			await page.click(gameTypeDropdown);
			// console.log(`${index}: waiting for gameTypeSelector`);
			await page.waitForSelector(gameTypeSelector, { timeout: 60000 }); // Wait up to 60 seconds
			await page.click(gameTypeSelector);
			// console.log(`${index}: waiting for gameTypeSelector to be detached`);
			await page.waitForSelector(gameTypeSelector, { detached: true, timeout: 5000 });

			await page.click(filterButton);
			// console.log('Waiting for winsSelector selector...');
			// console.log(`${index}: waiting for winsSelector, or noDataSelector`);
			await Promise.race([
				page.waitForSelector(winsSelector, { timeout: 4 * 60000 }), // Wait up to 60 seconds
				page.waitForSelector(noDataSelector, { timeout: 4 * 60000 }), // Wait up to 60 seconds
			]);
			break;
		} catch (error) {
			attempts++;
			console.log(`Attempt ${attempts} failed. Retrying...`);
			if (error.name === 'TimeoutError') {
				console.log('Timeout while waiting for wins selector.');
			} else {
				console.error(`Error fetching wins data: ${error.message}`);
			}
		}
	}

	// console.log('taking screenshot...');
	await page.screenshot({ path: `./screenshots/screenshot_${playerId}_${label}.png` });
	// wait for the QM games to load
	// console.log('getting winsSelector selector...');
	let wins =
		parseInt((await page.$eval(winsSelector, el => el.textContent.trim()).catch(() => 'None')).replace(/,/g, '')) || 0;
	// console.log('getting lossesSelector selector...');
	let losses =
		parseInt((await page.$eval(lossesSelector, el => el.textContent.trim()).catch(() => 'None')).replace(/,/g, '')) ||
		0;

	const games = (wins === 0) & (losses === 0) ? -1 : wins + losses;
	return { games, wins, losses };
}

/**
 * Processes an array of tasks with a concurrency limit.
 * @param {Array<Function>} urls - An array of functions that return promises.
 * @param {number} concurrencyLimit - The maximum number of concurrent tasks.
 * @returns {Promise<Array>} - A promise that resolves to an array of results.
 */
async function processWithConcurrency(browser, urls, concurrencyLimit = 10) {
	const results = [];
	const running = []; // Tracks the currently running tasks
	let taskIndex = 0;
	// let tempIndex = 0;

	async function runTask(task, url, taskIndex) {
		try {
			const result = await task(browser, url, taskIndex); // Execute the asynchronous task
			return result; // Store the result in the correct order
		} catch (error) {
			console.error(`Error processing URL at taskIndex ${taskIndex}: ${error.message}`);
			return { qmMmr: 'Error', slMmr: 'Error', qmGames: 'Error', slGames: 'Error' }; // Handle errors gracefully
		} finally {
			// Remove the completed task from the running array
			const runningIndex = running.indexOf(taskIndex);
			if (runningIndex !== -1) {
				running.splice(runningIndex, 1);
			} else {
				console.error(`Task ${taskIndex} not found in running tasks.`);
			}
			console.log(`Task ${taskIndex} completed. Running tasks: ${running.length}`);

			// // If there are more urls and the running queue has space, start the next one
			// if (taskIndex < urls.length && running.size < concurrencyLimit && tempIndex < 10) {
			// 	const task = runTask(scrapePlayerStats, urls[taskIndex], taskIndex);
			// 	running.add(task);
			// 	results[taskIndex] = task; // Store the result in the correct order
			// 	taskIndex++;
			// 	tempIndex++;
			// }
		}
	}

	// Start the initial batch of tasks
	while (taskIndex < urls.length || running.length > 0) {
		while (running.length < Math.min(urls.length, concurrencyLimit) && taskIndex < urls.length) {
			const taskPromise = runTask(scrapePlayerStats, urls[taskIndex], taskIndex);
			running.push(taskIndex);
			results[taskIndex] = taskPromise; // Store the promise in the results array
			// results[taskIndex] = task; // Store the result in the correct order
			console.log(`A.Starting task ${taskIndex}...`);
			taskIndex++;
			console.log(
				'1.taskIndex',
				taskIndex,
				'running',
				running.length,
				'concurrencyLimit',
				concurrencyLimit,
				'urls.length:',
				urls.length,
				running
			);
		}
		// Wait for all currently running tasks to complete before continuing.
		// New tasks are added dynamically in the `runTask` function.
		// sleep for 1 second
		console.log('Waiting for a task to finish...');
		await Promise.race(results); // Wait for the first running task to complete
		await new Promise(resolve => setTimeout(resolve, 1000));
		console.log('done waiting for a task to finish...');
		// sleep 1 second

		// Log the current state
		// console.log(
		// 	'B.taskIndex',
		// 	taskIndex,
		// 	'running',
		// 	running.length,
		// 	'concurrencyLimit',
		// 	concurrencyLimit,
		// 	'urls.length:',
		// 	urls.length,
		// 	running
		// );
	}

	return results;
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
		//TODO enable this
		const clipboardText = await clipboardy.read(); // Read from clipboard
		//TODO remove this
		// const clipboardText = 'https://www.heroesprofile.com/Player/JimmyBobJoe/8034886/1';
		//TODO option 2
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
		console.log('loading:');
		console.log(`${clipboardText.split('\n').length} players`);
		console.log(clipboardText);
		console.log('');
		const playerUrls = clipboardText
			.split('\n')
			.map(id => id.trim())
			.filter(id => id !== '');

		if (playerUrls.length === 0) {
			console.log('No player IDs found on the clipboard.');
			return;
		}

		// const baseUrl = 'https://www.heroesprofile.com/battletag/searched';

		// const allStats = [];
		// for (const url of playerUrls) {
		// 	if (!url.startsWith('http')) {
		// 		console.log(`Invalid URL: ${url}`);
		// 		continue;
		// 	}
		// 	// console.log(`Scraping data for ${url}...`);
		// 	const stats = await scrapePlayerStats(url);
		// 	allStats.push(stats);
		// }

		// check that all playerUrls are valid
		const invalidUrls = playerUrls.filter(url => !url.startsWith('http'));
		if (invalidUrls.length > 0) {
			console.error('Invalid URLs found:');
			invalidUrls.forEach(url => console.error(url));
			return;
		}

		// singlethreaded the scraping process
		const browser = await puppeteer.launch({ headless: 'new' });
		// multithreaded the scraping process
		// const allStats = await processWithConcurrency(browser, playerUrls, 3); // Adjust concurrency limit as needed

		const allStatsProm = playerUrls.map((url, index) => {
			// call the scrapePlayerStats function for each url
			return scrapePlayerStats(browser, url, index);
		});
		const allStats = await Promise.all(allStatsProm); // Wait for all scraping tasks to complete

		await browser.close();
		console.log(`allStats: ${allStats}, length: ${allStats.length}`);

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
