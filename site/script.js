class JobsApp {
    constructor() {
        this.searchInput = document.getElementById('searchInput');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        this.rankFilters = document.querySelectorAll('.rank-filter input[type="checkbox"]');
        this.jobsContainer = document.getElementById('jobsContainer');
        this.allJobs = Array.from(document.querySelectorAll('.job-card'));
        this.themeToggle = document.getElementById('themeToggle');
        this.modal = document.getElementById('jobModal');
        this.modalClose = document.getElementById('modalClose');
        
        this.initEventListeners();
        this.initTheme();
        this.initModal();
    }

    initEventListeners() {
        this.searchInput.addEventListener('input', () => this.filterJobs());
        
        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', (e) => this.setFilter(e.target));
        });

        this.rankFilters.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.filterJobs());
        });

        this.themeToggle.addEventListener('click', () => this.toggleTheme());
    }

    initModal() {
        // Add event listeners to all view full description buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-view-full')) {
                const jobCard = e.target.closest('.job-card');
                if (jobCard) {
                    const jobData = JSON.parse(jobCard.getAttribute('data-job'));
                    this.showModal(jobData);
                }
            }
        });

        // Close modal when clicking the X button
        this.modalClose.addEventListener('click', () => this.closeModal());

        // Close modal when clicking outside the modal content
        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        // Close modal with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.closeModal();
            }
        });
    }

    showModal(jobData) {
        document.getElementById('modalTitle').textContent = jobData.title;
        document.getElementById('modalInstitution').textContent = jobData.institution;
        
        // Build meta information
        let metaHTML = '';
        metaHTML += `<div><strong>Deadline:</strong> <span class="${jobData.isExpired ? 'expired-text' : ''}">${jobData.deadline}</span></div>`;
        
        if (jobData.regions && jobData.regions.length > 0) {
            metaHTML += `<div><strong>Regions:</strong> ${jobData.regions.join(', ')}</div>`;
        }
        
        if (jobData.ranks && jobData.ranks.length > 0) {
            metaHTML += `<div><strong>Ranks:</strong> ${jobData.ranks.join(', ')}</div>`;
        }
        
        if (jobData.experiments && jobData.experiments.length > 0) {
            metaHTML += `<div><strong>Experiments:</strong> ${jobData.experiments.join(', ')}</div>`;
        }
        
        document.getElementById('modalMeta').innerHTML = metaHTML;
        
        // Set full description
        const description = jobData.description || 'No description available.';
        document.getElementById('modalDescription').innerHTML = description;
        
        // Build actions
        let actionsHTML = '';
        
        if (jobData.inspireHepUrl) {
            actionsHTML += `<a href="${jobData.inspireHepUrl}" target="_blank" class="btn-apply">View on InspireHEP</a>`;
        }
        
        if (jobData.urls && jobData.urls.length > 0) {
            actionsHTML += `<a href="${jobData.urls[0]}" target="_blank" class="btn-apply">External Link</a>`;
        }
        
        if (jobData.contact_email) {
            actionsHTML += `<a href="mailto:${jobData.contact_email}" class="btn-contact">Contact</a>`;
        }
        
        document.getElementById('modalActions').innerHTML = actionsHTML;
        
        // Show modal
        this.modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        this.modal.classList.remove('show');
        document.body.style.overflow = '';
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
        const selectedRanks = Array.from(document.querySelectorAll('.rank-filter input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.value);
        
        this.allJobs.forEach(job => {
            const matchesSearch = this.matchesSearchTerm(job, searchTerm);
            const matchesFilter = this.matchesFilter(job, activeFilter);
            const matchesRank = this.matchesRankFilter(job, selectedRanks);
            
            if (matchesSearch && matchesFilter && matchesRank) {
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

    matchesRankFilter(job, selectedRanks) {
        if (selectedRanks.length === 0) return true; // If no ranks selected, show all
        
        const jobRanks = job.dataset.ranks ? job.dataset.ranks.split(',') : [];
        if (jobRanks.length === 0) return selectedRanks.includes('OTHER'); // Jobs without ranks are considered "OTHER"
        
        // Check if job has any of the selected ranks
        return jobRanks.some(rank => selectedRanks.includes(rank.trim()));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new JobsApp();
});