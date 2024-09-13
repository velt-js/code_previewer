// GitHub Repo Viewer

// Function to fetch repository contents with caching
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

// Modify the matchesIgnorePattern function to handle both files and folders
function matchesIgnorePattern(path, pattern) {
	const parts = path.split('/');
	const fileName = parts[parts.length - 1];

	if (pattern.includes('/')) {
		// If pattern includes '/', match against the full path
		return new RegExp('^' + pattern.replace(/\*/g, '.*') + '$').test(path);
	} else {
		// Otherwise, match against the file/folder name
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

// Function to create folder structure
function createFolderStructure(container, items, owner, repo, options, currentPath = '') {
	const ul = document.createElement('ul');
	ul.className = `indent-${currentPath.split('/').length}`;

	// Sort items: folders first, then files, both in alphabetical order
	const sortedItems = items.sort((a, b) => {
		if (a.type === b.type) {
			return a.name.localeCompare(b.name);
		}
		return a.type === 'dir' ? -1 : 1;
	});

	sortedItems.forEach((item, index) => {
		const itemPath = currentPath ? `${currentPath}/${item.name}` : item.name;

		// Skip ignored files and folders
		if (options.ignoreFiles && options.ignoreFiles.some(pattern => matchesIgnorePattern(itemPath, pattern))) {
			return;
		}

		const li = document.createElement('li');
			li.style.animationDelay = `${index * 0.05}s`; // Stagger animation
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
					// Toggle visibility if already fetched
					subUl.style.display = subUl.style.display === 'none' ? 'block' : 'none';
					li.classList.toggle('folder-open');
					folderIcon.classList.toggle('open');
					
					if (li.classList.contains('folder-open')) {
						// Reset animations when opening
						Array.from(subUl.children).forEach((child, idx) => {
							child.style.animation = 'none';
							child.offsetHeight; // Trigger reflow
							child.style.animation = null;
							child.style.animationDelay = `${idx * 0.05}s`;
						});
					}
				} else {
					// Fetch and create subfolder structure
					const subItems = await fetchRepoContents(owner, repo, itemPath);
					await createFolderStructure(li, subItems, owner, repo, options, itemPath);
					li.classList.add('folder-open');
					folderIcon.classList.add('open');
					// Ensure the newly created subUl is visible
					li.querySelector('ul').style.display = 'block';
				}
			};
		} else {
			const fileIcon = document.createElement('i');
			fileIcon.className = 'file-icon';

			// Add specific file type class
			const extension = item.name.split('.').pop().toLowerCase();
			switch (extension) {
				case 'js':
					fileIcon.classList.add('js');
					break;
				case 'ts':
					fileIcon.classList.add('ts');
					break;
				case 'html':
					fileIcon.classList.add('html');
					break;
				case 'css':
					fileIcon.classList.add('css');
					break;
				case 'scss':
					fileIcon.classList.add('scss');
					break;
				case 'json':
					fileIcon.classList.add('json');
					break;
				case 'md':
					fileIcon.classList.add('md');
					break;
				case 'jpg':
				case 'jpeg':
				case 'png':
				case 'gif':
				case 'svg':
					fileIcon.classList.add('img');
					break;
				case 'pdf':
					fileIcon.classList.add('pdf');
					break;
			}
			itemSpan.prepend(fileIcon);

			itemSpan.onclick = async (e) => {
				e.stopPropagation();
				// Remove .file-open class from all files
				document.querySelectorAll('.file-open').forEach(el => el.classList.remove('file-open'));
				// Add .file-open class to the clicked file
				itemSpan.classList.add('file-open');

				if (['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm', 'ogg', 'mp3', 'wav'].includes(item.name.split('.').pop().toLowerCase())) {
					// For media files, we don't need to fetch the content, just pass the URL
					displayFileContent(item.name, '', item.download_url);
				} else {
					// For text files, fetch the content as before
					const content = await fetchFileContent(item.download_url);
					displayFileContent(item.name, content, item.download_url);
				}
			};
		}

		li.appendChild(itemSpan);
		ul.appendChild(li);
	});
	container.appendChild(ul);
}

// Function to fetch file content with caching
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

// Updated function to display file content based on file type
function displayFileContent(fileName, content, url) {
	const codeBlock = document.getElementById('codeBlock');
	const fileExtension = fileName.split('.').pop().toLowerCase();

	// Check if we have cached rendered HTML
	const cachedHtml = localStorage.getItem(`rendered_${fileName}`);
	if (cachedHtml) {
		codeBlock.innerHTML = cachedHtml;
		return; // Exit early if we have cached content
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
			// For text content, use the existing code-prettify logic
			contentHtml = `
				<h3>${fileName}</h3>
				<pre class="prettyprint linenums">${escapeHtml(content.trimStart())}</pre>
			`;
			break;
	}

	codeBlock.innerHTML = contentHtml;

	// Only call PR.prettyPrint() for text content
	if (!['jpg', 'jpeg', 'png', 'gif', 'mp4', 'webm', 'ogg', 'mp3', 'wav'].includes(fileExtension)) {
		PR.prettyPrint();
		// Cache the rendered HTML after prettifying
		cacheRenderedHtml(fileName, codeBlock.innerHTML);
	} else {
		// For non-text content, cache the contentHtml directly
		cacheRenderedHtml(fileName, contentHtml);
	}
}

// Helper function to escape HTML
function escapeHtml(unsafe) {
	return unsafe
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// Function to get query parameters
function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
}

// Main function to initialize the viewer
async function initRepoViewer(repoUrl, options = {}) {
    const [, , , owner, repo] = repoUrl.split('/');
    const repoContents = await fetchRepoContents(owner, repo);
    const container = document.getElementById('repoStructure');
    await createFolderStructure(container, repoContents, owner, repo, options);

    // Update the toolbar title
    document.querySelector('.toolbar p').textContent = repo;

    if (options.defaultFile) {
        await openDefaultFile(owner, repo, options.defaultFile);
    }
}

async function openDefaultFile(owner, repo, filePath) {
	const pathParts = filePath.split('/');
	let currentElement = document.getElementById('repoStructure');

	// Navigate through the folder structure
	for (let i = 0; i < pathParts.length - 1; i++) {
		const folderSpan = Array.from(currentElement.querySelectorAll('span.folder'))
			.find(span => span.textContent.trim() === pathParts[i]);
		
		if (folderSpan) {
			await folderSpan.click(); // This will trigger the folder opening
			currentElement = folderSpan.closest('li');
		} else {
			console.error(`Folder not found: ${pathParts[i]}`);
			return;
		}
	}

	// Find and click the file
	const fileName = pathParts[pathParts.length - 1];
	const fileSpan = Array.from(currentElement.querySelectorAll('span.file'))
		.find(span => span.textContent.trim() === fileName);
	
	if (fileSpan) {
		setTimeout(() => {
			fileSpan.click(); // This will open the file
		}, 300);
	} else {
		console.error(`File not found: ${fileName}`);
	}
}

// Function to highlight special comments
function highlightSpecialComments(code) {
	// Regex to match single-line and multi-line comments
	const commentRegex = /(\/\/.*|\/\*[\s\S]*?\*\/)/g;

	return code.replace(commentRegex, match => {
		if (match.trim().startsWith('// Identify') || match.trim().startsWith('/* Identify')) {
			return `<span class="comment-highlight">${escapeHtml(match)}</span>`;
		}
		return escapeHtml(match);
	});
}

// Add this new function to cache rendered HTML
function cacheRenderedHtml(fileName, renderedHtml) {
	const cacheKey = `rendered_${fileName}`;
	localStorage.setItem(cacheKey, renderedHtml);
}

// Usage
const repoUrl = getQueryParam('github');
const previewUrl = getQueryParam('preview');

if (repoUrl) {
    const options = {
        ignoreFiles: ['.gitignore', 'README.md', 'package-lock.json', '*.spec.ts', 'test/*', '.vscode', '.editorconfig'],
        defaultFile: 'src/app/app.component.ts' // Example of a nested default file
    };

    initRepoViewer(repoUrl, options);
} else {
    console.error('No GitHub URL provided');
}

if (previewUrl) {
    document.getElementById('previewFrame').src = previewUrl;
} else {
    console.error('No preview URL provided');
}

const toggleButtons = document.querySelectorAll('.buttons')[0].children;

let isPreviewOpen = true;

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