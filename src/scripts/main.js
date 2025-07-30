class JobsApp {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        this.jobsContainer = document.getElementById('jobsContainer');
        this.allJobs = Array.from(document.querySelectorAll('.job-card'));
        this.themeToggle = document.getElementById('themeToggle');
        
        this.initEventListeners();
        this.initTheme();
    }

    initEventListeners() {
        this.searchInput.addEventListener('input', () => this.filterJobs());
        
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target));
        });

        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    initTheme() {
        // Check for saved theme preference or default to light mode
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
        
        // Update theme toggle icon
        const themeIcon = this.themeToggle.querySelector('.theme-icon');
        themeIcon.textContent = theme === 'light' ? '🌙' : '☀️';
        
        // Update toggle button aria-label
        this.themeToggle.setAttribute('aria-label', 
            theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'
        );
    }

    setFilter(button) {
        this.filterButtons.forEach(btn => btn.classList.remove('active'));
        button.classList.add('active');
        this.filterJobs();
    }

    filterJobs() {
        const searchTerm = this.searchInput.value.toLowerCase();
        const activeFilter = document.querySelector('.filter-btn.active').dataset.filter;
        
        this.allJobs.forEach(job => {
            const matchesSearch = this.matchesSearchTerm(job, searchTerm);
            const matchesFilter = this.matchesFilter(job, activeFilter);
            
            if (matchesSearch && matchesFilter) {
                job.classList.remove('hidden');
            } else {
                job.classList.add('hidden');
            }
        });
    }

    matchesSearchTerm(job, searchTerm) {
        if (!searchTerm) return true;
        return job.textContent.toLowerCase().includes(searchTerm);
    }

    matchesFilter(job, filter) {
        switch (filter) {
            case 'active':
                return !job.classList.contains('expired');
            case 'expired':
                return job.classList.contains('expired');
            case 'all':
            default:
                return true;
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new JobsApp();
});