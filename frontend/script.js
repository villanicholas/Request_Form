// Configuration
// Use relative URLs that work in both local and deployed environments
const API_URL = '/api';

// DOM Elements
const collegeSearchInput = document.getElementById('college-search');
const collegeDropdown = document.getElementById('college-dropdown');
const loadingIndicator = document.getElementById('loading-indicator');
const selectedCollegeInput = document.getElementById('selected-college');
const requestForm = document.getElementById('request-form');
const errorMessage = document.getElementById('error-message');
const successMessage = document.getElementById('success-message');

// State variables
let searchTimeout;
let colleges = [];

// Event Listeners
collegeSearchInput.addEventListener('input', handleCollegeInput);
requestForm.addEventListener('submit', handleSubmit);

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!collegeSearchInput.contains(e.target) && !collegeDropdown.contains(e.target)) {
        collegeDropdown.style.display = 'none';
    }
});

/**
 * Handle input in the college search field
 */
function handleCollegeInput(e) {
    const query = e.target.value.trim();
    
    // Clear the selected college when input changes
    selectedCollegeInput.value = '';
    
    if (query.length < 2) {
        collegeDropdown.style.display = 'none';
        return;
    }

    // Debounce search requests
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => searchColleges(query), 300);
}

/**
 * Search for colleges using the backend API
 */
async function searchColleges(query) {
    showLoading(true);
    
    try {
        console.log('Searching for colleges with query:', query);
        const response = await fetch(`${API_URL}/search-colleges?query=${encodeURIComponent(query)}`);
        
        if (!response.ok) {
            throw new Error(`Search failed with status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log('College search response:', data);
        
        colleges = Array.isArray(data) ? data : [];
        displayColleges();
    } catch (error) {
        console.error('Error searching colleges:', error);
        showError('Failed to search colleges. Please try again.');
        colleges = [];
        collegeDropdown.style.display = 'none';
    } finally {
        showLoading(false);
    }
}

/**
 * Display the list of colleges in the dropdown
 */
function displayColleges() {
    collegeDropdown.innerHTML = '';
    
    if (colleges.length === 0) {
        const noResults = document.createElement('div');
        noResults.className = 'dropdown-item';
        noResults.textContent = 'No colleges found. Try a different search term.';
        collegeDropdown.appendChild(noResults);
    } else {
        colleges.forEach(college => {
            const item = document.createElement('div');
            item.className = 'dropdown-item';
            
            // School icon (SVG)
            const schoolIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            schoolIcon.setAttribute('height', '24');
            schoolIcon.setAttribute('width', '24');
            schoolIcon.setAttribute('viewBox', '0 0 24 24');
            
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M12 3L1 9l4 2.18v6L12 21l7-3.82v-6l2-1.09V17h2V9L12 3zm6.82 6L12 12.72 5.18 9 12 5.28 18.82 9zM17 15.99l-5 2.73-5-2.73v-3.72L12 15l5-2.73v3.72z');
            schoolIcon.appendChild(path);
            
            const infoDiv = document.createElement('div');
            infoDiv.className = 'school-info';
            
            const nameDiv = document.createElement('div');
            nameDiv.className = 'school-name';
            nameDiv.textContent = college.name;
            
            const locationDiv = document.createElement('div');
            locationDiv.className = 'school-location';
            locationDiv.textContent = `${college.city}, ${college.state}`;
            
            infoDiv.appendChild(nameDiv);
            infoDiv.appendChild(locationDiv);
            
            item.appendChild(schoolIcon);
            item.appendChild(infoDiv);
            
            item.addEventListener('click', () => selectCollege(college));
            collegeDropdown.appendChild(item);
        });
    }
    
    collegeDropdown.style.display = 'block';
}

/**
 * Select a college from the dropdown
 */
function selectCollege(college) {
    collegeSearchInput.value = college.name;
    selectedCollegeInput.value = college.name;
    collegeDropdown.style.display = 'none';
}

/**
 * Show/hide loading indicator
 */
function showLoading(show) {
    loadingIndicator.style.display = show ? 'block' : 'none';
}

/**
 * Show error message
 */
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorMessage.style.display = 'none';
    }, 5000);
}

/**
 * Show success message
 */
function showSuccess(message) {
    successMessage.textContent = message;
    successMessage.style.display = 'block';
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        successMessage.style.display = 'none';
    }, 5000);
}

/**
 * Handle form submission
 */
async function handleSubmit(e) {
    e.preventDefault();
    
    // Reset messages
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';
    
    const collegeName = selectedCollegeInput.value.trim();
    const email = document.getElementById('email').value.trim();
    
    // Validation
    if (!collegeName) {
        showError('Please select a college from the dropdown');
        return;
    }
    
    try {
        const response = await fetch(`${API_URL}/submit-request`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                college_name: collegeName,
                email: email
            })
        });
        
        const result = await response.json();
        
        if (!response.ok) {
            // Check for specific error messages
            if (result.error && result.error.includes('email has already been used')) {
                showError(result.error);
            } else {
                throw new Error(result.error || `Submission failed with status: ${response.status}`);
            }
            return;
        }
        
        showSuccess('Request submitted successfully!');
        
        // Reset the form
        requestForm.reset();
        selectedCollegeInput.value = '';
    } catch (error) {
        console.error('Error submitting request:', error);
        showError('Failed to submit request. Please try again.');
    }
} 