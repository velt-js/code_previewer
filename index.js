// GitHub Repo Viewer

// Global variables
let isPreviewOpen = true;
const toggleButtons = document.querySelectorAll('.buttons')[0].children;

// Utility functions
function getQueryParam(param) {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.get(param);
}

function escapeHtml(unsafe) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// API and data fetching functions
async function fetchRepoContents(owner, repo, path = '') {
	const cacheKey = `repo_${owner}_${repo}_${path}`;
	const cachedData = localStorage.getItem(cacheKey);

	if (cachedData) {
		return JSON.parse(cachedData);
	}

	const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
	const response = await fetch(apiUrl);
	const data = await response.json();

	localStorage.setItem(cacheKey, JSON.stringify(data));
	return data;
}

async function fetchFileContent(url) {
	const cacheKey = `file_${url}`;
	const cachedContent = localStorage.getItem(cacheKey);

	if (cachedContent) {
		return cachedContent;
	}

	const response = await fetch(url);
	const content = await response.text();

	localStorage.setItem(cacheKey, content);
	return content;
}

// File structure and display functions
function matchesIgnorePattern(path, pattern) {
	const parts = path.split('/');
	const fileName = parts[parts.length - 1];

	if (pattern.includes('/')) {
		return new RegExp('^' + pattern.replace(/\*/g, '.*') + '$').test(path);
	} else {
		if (pattern.startsWith('*') && pattern.endsWith('*')) {
			return fileName.includes(pattern.slice(1, -1));
		} else if (pattern.startsWith('*')) {
			return fileName.endsWith(pattern.slice(1));
		} else if (pattern.endsWith('*')) {
			return fileName.startsWith(pattern.slice(0, -1));
		} else {
			return fileName === pattern;
		}
	}
}

function createFolderStructure(container, items, owner, repo, options, currentPath = '', callback = null) {
	const ul = document.createElement('ul');
	ul.className = `indent-${currentPath.split('/').length}`;

	const sortedItems = items.sort((a, b) => {
		if (a.type === b.type) {
			return a.name.localeCompare(b.name);
		}
		return a.type === 'dir' ? -1 : 1;
	});

	sortedItems.forEach((item, index) => {
		const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;

		if (options.ignoreFiles && options.ignoreFiles.some(pattern => matchesIgnorePattern(itemPath, pattern))) {
			return;
		}

		const li = document.createElement('li');
		li.style.animationDelay = `${index * 0.05}s`;
		const itemSpan = document.createElement('span');
		itemSpan.textContent = item.name;
		itemSpan.className = item.type === 'dir' ? 'folder' : 'file';

		if (item.type === 'dir') {
			const folderIcon = document.createElement('i');
			folderIcon.className = 'folder-icon';
			itemSpan.prepend(folderIcon);

			itemSpan.onclick = async (e) => {
				e.stopPropagation();
				const subUl = li.querySelector('ul');
				if (subUl) {
					subUl.style.display = subUl.style.display === 'none' ? 'block' : 'none';
					li.classList.toggle('folder-open');
					folderIcon.classList.toggle('open');

					if (li.classList.contains('folder-open')) {
						Array.from(subUl.children).forEach((child, idx) => {
							child.style.animation = 'none';
							child.offsetHeight;
							child.style.animation = null;
							child.style.animationDelay = `${idx * 0.05}s`;
						});
					}
				} else {
					const subItems = await fetchRepoContents(owner, repo, itemPath);
					await createFolderStructure(li, subItems, owner, repo, options, itemPath);
					li.classList.add('folder-open');
					folderIcon.classList.add('open');
					li.querySelector('ul').style.display = 'block';
				}
			};
		} else {
			const fileIcon = document.createElement('i');
			fileIcon.className = 'file-icon';
			const extension = item.name.split('.').pop().toLowerCase();
			fileIcon.classList.add(extension);
			itemSpan.prepend(fileIcon);

			itemSpan.onclick = async (e) => {
				e.stopPropagation();
				document.querySelectorAll('.file-open').forEach(el => el.classList.remove('file-open'));
				itemSpan.classList.add('file-open');

				if (['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm', 'ogg', 'mp3', 'wav'].includes(extension)) {
					displayFileContent(item.name, '', item.download_url);
				} else {
					const content = await fetchFileContent(item.download_url);
					displayFileContent(item.name, content, item.download_url);
				}
			};
		}

		li.appendChild(itemSpan);
		ul.appendChild(li);
	});

	container.appendChild(ul);

	if (callback) {
		callback();
	}
}

function displayFileContent(fileName, content, url) {
	const codeBlock = document.getElementById('codeBlock');
	const fileExtension = fileName.split('.').pop().toLowerCase();

	const cachedHtml = localStorage.getItem(`rendered_${fileName}`);
	if (cachedHtml) {
		codeBlock.innerHTML = cachedHtml;
		return;
	}

	let contentHtml = '';

	switch (fileExtension) {
		case 'jpg':
		case 'jpeg':
		case 'png':
		case 'gif':
			contentHtml = `<img src="${url}" alt="${fileName}" style="max-width: 100%;">`;
			break;
		case 'mp4':
		case 'webm':
		case 'ogg':
			contentHtml = `<video controls style="max-width: 100%;"><source src="${url}" type="video/${fileExtension}">Your browser does not support the video tag.</video>`;
			break;
		case 'mp3':
		case 'wav':
			contentHtml = `<audio controls><source src="${url}" type="audio/${fileExtension}">Your browser does not support the audio tag.</audio>`;
			break;
		default:
			contentHtml = `
                <h3>${fileName}</h3>
                <pre class="prettyprint linenums scrollable-content">${escapeHtml(content.trimStart())}</pre>
            `;
			break;
	}

	codeBlock.innerHTML = contentHtml;

	if (!['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm', 'ogg', 'mp3', 'wav'].includes(fileExtension)) {
		PR.prettyPrint();
	}

	cacheRenderedHtml(fileName, codeBlock.innerHTML);
}

function cacheRenderedHtml(fileName, renderedHtml) {
	const cacheKey = `rendered_${fileName}`;
	localStorage.setItem(cacheKey, renderedHtml);
}

// UI control functions
function hideToolbar() {
	const toolbar = document.querySelector('.toolbar');
	if (toolbar) {
		toolbar.style.display = 'none';
	}
}

function setSelectedTab(tab) {
	if (tab === 'Code') {
		showCode();
	} else if (tab === 'Preview') {
		showPreview();
	}
}

function showHelperText(show = true) {

	const helperText = document.querySelector('.helper-container');

	if (show) {
		helperText.style.display = 'block';
	} else {
		helperText.style.display = 'none';
	}

	const codeBlock = document.getElementById('codeBlock');
	const toolbar = document.querySelector('.toolbar p');

	toolbar.textContent = 'Helper';
	codeBlock.innerHTML = '';
}

function showPreview() {
	document.getElementById('codeBlock').style.display = 'none';
	document.getElementById('repoStructure').style.display = 'none';
	document.getElementById('previewFrame').style.display = 'block';
	isPreviewOpen = true;
	toggleButtons[0].classList.remove('active');
	toggleButtons[1].classList.add('active');
}

function showCode() {
	document.getElementById('codeBlock').style.display = 'block';
	document.getElementById('repoStructure').style.display = 'block';
	document.getElementById('previewFrame').style.display = 'none';
	isPreviewOpen = false;
	toggleButtons[1].classList.remove('active');
	toggleButtons[0].classList.add('active');
}

// Main initialization function
async function initRepoViewer(repoUrl, options = {}) {
	const [, , , owner, repo] = repoUrl.split('/');
	const repoContents = await fetchRepoContents(owner, repo);
	const container = document.getElementById('repoStructure');

	document.querySelector('.toolbar p').textContent = repo;

	await new Promise(resolve => {
		createFolderStructure(container, repoContents, owner, repo, options, '', resolve);
	});

	if (options.defaultFile) {
		await openDefaultFile(owner, repo, options.defaultFile);
	}
}

async function openDefaultFile(owner, repo, filePath) {
	const pathParts = filePath.split('/');
	let currentElement = document.getElementById('repoStructure');

	for (let i = 0; i < pathParts.length - 1; i++) {
		const folderSpan = Array.from(currentElement.querySelectorAll('span.folder'))
			.find(span => span.textContent.trim() === pathParts[i]);

		if (folderSpan) {
			await folderSpan.click();
			currentElement = folderSpan.closest('li');
		} else {
			console.error(`Folder not found: ${pathParts[i]}`);
			return;
		}
	}

	const fileName = pathParts[pathParts.length - 1];
	const fileSpan = Array.from(currentElement.querySelectorAll('span.file'))
		.find(span => span.textContent.trim() === fileName);

	if (fileSpan) {
		setTimeout(() => {
			fileSpan.click();
		}, 300);
	} else {
		console.error(`File not found: ${fileName}`);
	}
}

// Main execution
const repoUrl = getQueryParam('github');
const previewUrl = getQueryParam('preview');
const hideToolbarParam = getQueryParam('hideToolbar');
const selectedTab = getQueryParam('selectedTab');

if (hideToolbarParam === 'true') {
	hideToolbar();
}

if (repoUrl && previewUrl) {
	showHelperText(false);
	const options = {
		ignoreFiles: ['.gitignore', 'README.md', 'package-lock.json', '*.spec.ts', 'test/*', '.vscode', '.editorconfig'],
		defaultFile: 'src/app/app.component.ts'
	};

	initRepoViewer(repoUrl, options);
	document.getElementById('previewFrame').src = previewUrl;

	if (selectedTab === 'Code' || selectedTab === 'Preview') {
		setSelectedTab(selectedTab);
	}
} else {
	showHelperText();
}