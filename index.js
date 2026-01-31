// GitHub Repo Viewer

// Global variables
let isPreviewOpen = true;
const toggleButtons = document.querySelectorAll('.buttons')[0].children;
const CACHE_ENABLED = false;
const REPO_URL_INPUT_ID = 'repoUrlInput';
const PREVIEW_URL_INPUT_ID = 'previewUrlInput';
const LOAD_REPO_BUTTON_ID = 'loadRepoButton';
const REPO_LOAD_ERROR_ID = 'repoLoadError';
const DEFAULT_LOAD_REPOSITORY_BUTTON_TEXT = 'Load';
const THEME_COLOR_INPUT_ID = 'themeColorInput';
const THEME_COLOR_STORAGE_KEY = 'themeColor';
const DEFAULT_THEME_COLOR = '#1A2A7C';
const THEME_COLOR_QUERY_PARAM = 'themeColor';

/**
 * Clears cached repo/file HTML from localStorage without removing user settings.
 *
 * @returns {void}
 */
function clearCacheStorage() {
    try {
        const keysToRemove = [];
        for (let keyIndex = 0; keyIndex < localStorage.length; keyIndex++) {
            const storageKey = localStorage.key(keyIndex);
            if (!storageKey) {
                continue;
            }

            if (storageKey.startsWith('repo_') || storageKey.startsWith('file_') || storageKey.startsWith('rendered_')) {
                keysToRemove.push(storageKey);
            }
        }

        keysToRemove.forEach((storageKey) => {
            try {
                localStorage.removeItem(storageKey);
            } catch (removeError) {
                // no-op
            }
        });
    } catch (error) {
        // no-op
    }
}

if (!CACHE_ENABLED) {
    clearCacheStorage();
}

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

/**
 * Applies the theme color to the app via CSS variables.
 *
 * @param {string} themeColor
 * @returns {void}
 */
function applyThemeColor(themeColor) {
    try {
        const normalizedThemeColor = (themeColor || '').trim() || DEFAULT_THEME_COLOR;
        document.documentElement.style.setProperty('--app-bg', normalizedThemeColor);
    } catch (error) {
        // no-op
    }
}

/**
 * Initializes the helper view theme color picker.
 *
 * @returns {void}
 */
function initializeThemeColorPicker() {
    try {
        const themeColorInput = document.getElementById(THEME_COLOR_INPUT_ID);
        if (!themeColorInput) {
            return;
        }

        const storedThemeColor = localStorage.getItem(THEME_COLOR_STORAGE_KEY);
        const initialThemeColor = (storedThemeColor || '').trim() || DEFAULT_THEME_COLOR;

        themeColorInput.value = initialThemeColor;
        applyThemeColor(initialThemeColor);

        themeColorInput.addEventListener('input', (event) => {
            try {
                const selectedThemeColor = event && event.target ? event.target.value : '';
                if (selectedThemeColor) {
                    localStorage.setItem(THEME_COLOR_STORAGE_KEY, selectedThemeColor);
                    applyThemeColor(selectedThemeColor);
                }
            } catch (innerError) {
                // no-op
            }
        });
    } catch (error) {
        // no-op
    }
}

/**
 * Normalizes a theme color query param value to a hex color string.
 * Supports `#RRGGBB` or `RRGGBB`.
 *
 * @param {string} themeColorValue
 * @returns {string|null}
 */
function normalizeThemeColor(themeColorValue) {
    try {
        const trimmedValue = (themeColorValue || '').trim();
        if (!trimmedValue) {
            return null;
        }

        const withHash = trimmedValue.startsWith('#') ? trimmedValue : `#${trimmedValue}`;
        if (!/^#[0-9a-fA-F]{6}$/.test(withHash)) {
            return null;
        }

        return withHash.toUpperCase();
    } catch (error) {
        return null;
    }
}

/**
 * Updates the current URL query params without reloading the page.
 *
 * @param {{ github?: string, preview?: string, selectedTab?: string, hideToolbar?: string, themeColor?: string }} updatedParams
 * @returns {void}
 */
function updateUrlQueryParams(updatedParams) {
    try {
        const currentUrl = new URL(window.location.href);
        const urlParams = currentUrl.searchParams;

        Object.keys(updatedParams || {}).forEach((paramName) => {
            const paramValue = updatedParams[paramName];
            if (paramValue === null || paramValue === undefined || paramValue === '') {
                urlParams.delete(paramName);
            } else {
                urlParams.set(paramName, String(paramValue));
            }
        });

        const nextUrl = `${currentUrl.pathname}?${urlParams.toString()}`;
        window.history.replaceState({}, '', nextUrl);
    } catch (error) {
        // no-op
    }
}

// API and data fetching functions
async function fetchRepoContents(owner, repo, path = '') {
	const cacheKey = `repo_${owner}_${repo}_${path}`;
	const cachedData = localStorage.getItem(cacheKey);

	if (cachedData && CACHE_ENABLED) {
		return JSON.parse(cachedData);
	}

	const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
	const response = await fetch(apiUrl);
	const data = await response.json();

	if (CACHE_ENABLED) {
		localStorage.setItem(cacheKey, JSON.stringify(data));
	}

	return data;
}

async function fetchFileContent(url) {
	const cacheKey = `file_${url}`;
	const cachedContent = localStorage.getItem(cacheKey);

	if (cachedContent && CACHE_ENABLED) {
		return cachedContent;
	}

	const response = await fetch(url);
	const content = await response.text();

	if (CACHE_ENABLED) {
		localStorage.setItem(cacheKey, content);
	}

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
	if (cachedHtml && CACHE_ENABLED) {
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

	if (CACHE_ENABLED) {
		cacheRenderedHtml(fileName, codeBlock.innerHTML);
	}	
}

function cacheRenderedHtml(fileName, renderedHtml) {
	const cacheKey = `rendered_${fileName}`;
	if (CACHE_ENABLED) {
		localStorage.setItem(cacheKey, renderedHtml);
	}
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

/**
 * Normalizes a user-provided GitHub repo value into a full repo URL.
 * Accepts either `https://github.com/owner/repo` or `owner/repo`.
 *
 * @param {string} githubRepositoryValue
 * @returns {string|null}
 */
function normalizeGithubRepoUrl(githubRepositoryValue) {
    try {
        const trimmedValue = (githubRepositoryValue || '').trim();
        if (!trimmedValue) {
            return null;
        }

        if (trimmedValue.startsWith('http://') || trimmedValue.startsWith('https://')) {
            const parsedUrl = new URL(trimmedValue);
            if (!parsedUrl.hostname.includes('github.com')) {
                return null;
            }

            const repoPath = parsedUrl.pathname.replace(/\/+$/, '').replace(/\.git$/, '');
            const repoPathParts = repoPath.split('/').filter(Boolean);
            if (repoPathParts.length < 2) {
                return null;
            }

            return `https://github.com/${repoPathParts[0]}/${repoPathParts[1]}`;
        }

        const shorthandMatch = trimmedValue.match(/^([^/\s]+)\/([^/\s]+)$/);
        if (shorthandMatch) {
            return `https://github.com/${shorthandMatch[1].replace(/\.git$/, '')}/${shorthandMatch[2].replace(/\.git$/, '')}`;
        }

        return null;
    } catch (error) {
        return null;
    }
}

/**
 * Normalizes a user-provided preview URL to an absolute https/http URL.
 *
 * @param {string} previewUrlValue
 * @returns {string|null}
 */
function normalizePreviewUrl(previewUrlValue) {
    try {
        const trimmedValue = (previewUrlValue || '').trim();
        if (!trimmedValue) {
            return '';
        }

        if (!trimmedValue.startsWith('http://') && !trimmedValue.startsWith('https://')) {
            return null;
        }

        const parsedUrl = new URL(trimmedValue);
        return parsedUrl.href;
    } catch (error) {
        return null;
    }
}

/**
 * Updates the helper view error message text.
 *
 * @param {string} errorMessage
 * @returns {void}
 */
function setRepoLoadError(errorMessage) {
    try {
        const errorElement = document.getElementById(REPO_LOAD_ERROR_ID);
        if (errorElement) {
            errorElement.textContent = errorMessage || '';
        }
    } catch (error) {
        // no-op
    }
}

/**
 * Loads a repository from the helper input field.
 *
 * @returns {Promise<void>}
 */
async function loadRepositoryFromHelperInput() {
    try {
        setRepoLoadError('');

        const repoUrlInput = document.getElementById(REPO_URL_INPUT_ID);
        const previewUrlInput = document.getElementById(PREVIEW_URL_INPUT_ID);
        const loadRepositoryButton = document.getElementById(LOAD_REPO_BUTTON_ID);
        const themeColorInput = document.getElementById(THEME_COLOR_INPUT_ID);

        const rawInputValue = repoUrlInput ? repoUrlInput.value : '';
        const normalizedRepoUrl = normalizeGithubRepoUrl(rawInputValue);

        const rawPreviewValue = previewUrlInput ? previewUrlInput.value : '';
        const normalizedPreviewUrl = normalizePreviewUrl(rawPreviewValue);

        const selectedThemeColor = themeColorInput ? themeColorInput.value : '';
        const normalizedThemeColor = normalizeThemeColor(selectedThemeColor) || DEFAULT_THEME_COLOR;

        if (!normalizedRepoUrl && !normalizedPreviewUrl) {
            setRepoLoadError('Please enter a GitHub repository URL and/or a preview/output URL.');
            return;
        }

        if (rawPreviewValue && rawPreviewValue.trim() && normalizedPreviewUrl === null) {
            setRepoLoadError('Please enter a valid preview/output URL (must start with https:// or http://).');
            return;
        }

        if (rawInputValue && rawInputValue.trim() && !normalizedRepoUrl) {
            setRepoLoadError('Please enter a valid GitHub repository URL (e.g. https://github.com/owner/repo) or owner/repo.');
            return;
        }

        if (loadRepositoryButton) {
            loadRepositoryButton.disabled = true;
            loadRepositoryButton.textContent = 'Loading...';
        }

        applyThemeColor(normalizedThemeColor);
        try {
            localStorage.setItem(THEME_COLOR_STORAGE_KEY, normalizedThemeColor);
        } catch (storageError) {
            // no-op
        }

        showHelperText(false);

        if (normalizedPreviewUrl) {
            const previewFrame = document.getElementById('previewFrame');
            if (previewFrame) {
                previewFrame.src = normalizedPreviewUrl;
            }
        }

        if (normalizedRepoUrl) {
            const options = {
                ignoreFiles: ['.gitignore', 'README.md', 'package-lock.json', '*.spec.ts', 'test/*', '.vscode', '.editorconfig'],
                defaultFile: 'src/app/app.component.ts'
            };

            await initRepoViewer(normalizedRepoUrl, options);
        } else {
            const toolbarTitle = document.querySelector('.toolbar p');
            if (toolbarTitle) {
                toolbarTitle.textContent = 'Preview';
            }
        }

        updateUrlQueryParams({
            github: normalizedRepoUrl || '',
            preview: normalizedPreviewUrl || '',
            selectedTab: normalizedPreviewUrl ? 'Preview' : 'Code',
            [THEME_COLOR_QUERY_PARAM]: normalizedThemeColor.replace('#', '')
        });

        if (normalizedPreviewUrl) {
            showPreview();
        } else {
            showCode();
        }
    } catch (error) {
        setRepoLoadError('Could not load. Please check the repository/preview URLs and that the repo is public.');
        showHelperText(true);
    } finally {
        const loadRepositoryButton = document.getElementById(LOAD_REPO_BUTTON_ID);
        if (loadRepositoryButton) {
            loadRepositoryButton.disabled = false;
            loadRepositoryButton.textContent = DEFAULT_LOAD_REPOSITORY_BUTTON_TEXT;
        }
    }
}

// Main initialization function
async function initRepoViewer(repoUrl, options = {}) {
    const [, , , owner, repo] = repoUrl.split('/');
    const repoContents = await fetchRepoContents(owner, repo);
    const container = document.getElementById('repoStructure');
    const codeBlock = document.getElementById('codeBlock');

    if (container) {
        container.innerHTML = '';
    }
    if (codeBlock) {
        codeBlock.innerHTML = '';
    }

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
            // console.error(`Folder not found: ${pathParts[i]}`);
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
        // console.error(`File not found: ${fileName}`);
    }
}

// Main execution
const repoUrl = getQueryParam('github');
const previewUrl = getQueryParam('preview');
const hideToolbarParam = getQueryParam('hideToolbar');
const selectedTab = getQueryParam('selectedTab');
const themeColorParam = getQueryParam(THEME_COLOR_QUERY_PARAM);

if (hideToolbarParam === 'true') {
    hideToolbar();
}

const loadRepositoryButton = document.getElementById(LOAD_REPO_BUTTON_ID);
const repoUrlInput = document.getElementById(REPO_URL_INPUT_ID);
const previewUrlInput = document.getElementById(PREVIEW_URL_INPUT_ID);
initializeThemeColorPicker();

const initialThemeColor = normalizeThemeColor(themeColorParam);
if (initialThemeColor) {
    applyThemeColor(initialThemeColor);
    try {
        localStorage.setItem(THEME_COLOR_STORAGE_KEY, initialThemeColor);
    } catch (storageError) {
        // no-op
    }
}

if (loadRepositoryButton) {
    loadRepositoryButton.addEventListener('click', () => {
        loadRepositoryFromHelperInput();
    });
}

if (repoUrlInput) {
    repoUrlInput.addEventListener('keydown', (event) => {
        if (event && event.key === 'Enter') {
            loadRepositoryFromHelperInput();
        }
    });
}

if (previewUrlInput) {
    previewUrlInput.addEventListener('keydown', (event) => {
        if (event && event.key === 'Enter') {
            loadRepositoryFromHelperInput();
        }
    });
}

if (repoUrl || previewUrl) {
    showHelperText(false);
    if (repoUrl) {
        const options = {
            ignoreFiles: ['.gitignore', 'README.md', 'package-lock.json', '*.spec.ts', 'test/*', '.vscode', '.editorconfig'],
            defaultFile: 'src/app/app.component.ts'
        };

        initRepoViewer(repoUrl, options);
    }

    if (previewUrl) {
        document.getElementById('previewFrame').src = previewUrl;
    }

    if (selectedTab === 'Code' || selectedTab === 'Preview') {
        setSelectedTab(selectedTab);
    } else if (previewUrl) {
        showPreview();
    } else if (!previewUrl) {
        showCode();
    }
} else {
    showHelperText();
}