class JobsApp {
    constructor() {
        // Current source ('inspirehep', 'ajo', or 'desy')
        this.currentSource = localStorage.getItem('currentSource') || 'inspirehep';
        
        this.searchInput = document.getElementById('searchInput');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        this.rankFilters = document.querySelectorAll('.rank-filter input[type="checkbox"]');
        this.themeToggle = document.getElementById('themeToggle');
        this.modal = document.getElementById('jobModal');
        this.modalClose = document.getElementById('modalClose');
        this.previewPopup = document.getElementById('previewPopup');
        this.previewClose = document.getElementById('previewClose');
        this.previewViewFull = document.getElementById('previewViewFull');
        this.currentJobData = null;
        
        // Navigation and views
        this.navLinks = document.querySelectorAll('.nav-link');
        this.inspirehepView = document.getElementById('inspirehep-view');
        this.ajoView = document.getElementById('ajo-view');
        this.desyView = document.getElementById('desy-view');
        
        this.initEventListeners();
        this.initTheme();
        this.initModal();
        this.initPreviewPopup();
        this.switchSource(this.currentSource);
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
        
        // Source navigation
        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const source = link.getAttribute('data-source');
                this.switchSource(source);
            });
        });
    }

    switchSource(source) {
        this.currentSource = source;
        localStorage.setItem('currentSource', source);
        
        // Update active navigation
        this.navLinks.forEach(link => {
            if (link.getAttribute('data-source') === source) {
                link.classList.add('active');
            } else {
                link.classList.remove('active');
            }
        });
        
        // Switch views and hide/show rank filters
        if (source === 'inspirehep') {
            this.inspirehepView.classList.add('active');
            this.ajoView.classList.remove('active');
            this.desyView.classList.remove('active');
            document.getElementById('rankFilters').style.display = 'block';
        } else if (source === 'ajo') {
            this.ajoView.classList.add('active');
            this.inspirehepView.classList.remove('active');
            this.desyView.classList.remove('active');
            document.getElementById('rankFilters').style.display = 'none';
        } else if (source === 'desy') {
            this.desyView.classList.add('active');
            this.inspirehepView.classList.remove('active');
            this.ajoView.classList.remove('active');
            document.getElementById('rankFilters').style.display = 'none';
        }
        
        // Get jobs from current view
        let container;
        if (source === 'inspirehep') {
            container = document.getElementById('jobsContainerInspireHEP');
        } else if (source === 'ajo') {
            container = document.getElementById('jobsContainerAJO');
        } else {
            container = document.getElementById('jobsContainerDESY');
        }
        this.allJobs = Array.from(container.querySelectorAll('.job-card'));
        
        // Reset filters
        this.searchInput.value = '';
        this.filterButtons.forEach(btn => {
            if (btn.getAttribute('data-filter') === 'all') {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });
        
        this.filterJobs();
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
        
        // Skip regions and ranks for DESY jobs
        const isDESY = jobData.source === 'DESY';
        
        if (!isDESY && jobData.regions && jobData.regions.length > 0) {
            metaHTML += `<div><strong>Regions:</strong> ${jobData.regions.join(', ')}</div>`;
        }
        
        if (!isDESY && jobData.ranks && jobData.ranks.length > 0) {
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
        
        if (jobData.jobUrl) {
            const linkText = jobData.source === 'DESY' ? 'View on DESY' : 
                           jobData.source === 'AcademicJobsOnline' ? 'View on AJO' : 
                           'View on InspireHEP';
            actionsHTML += `<a href="${jobData.jobUrl}" target="_blank" class="btn-apply">${linkText}</a>`;
        } else if (jobData.inspireHepUrl) {
            actionsHTML += `<a href="${jobData.inspireHepUrl}" target="_blank" class="btn-apply">View on InspireHEP</a>`;
        } else if (jobData.urls && jobData.urls.length > 0) {
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

    initPreviewPopup() {
        // Click on job description to show preview
        document.addEventListener('click', (e) => {
            if (e.target.closest('.job-description')) {
                const jobCard = e.target.closest('.job-card');
                if (jobCard) {
                    const jobData = JSON.parse(jobCard.getAttribute('data-job'));
                    this.showPreview(jobData);
                }
            }
        });

        // Close preview when clicking X button
        this.previewClose.addEventListener('click', () => this.closePreview());

        // Close preview when clicking outside
        this.previewPopup.addEventListener('click', (e) => {
            if (e.target === this.previewPopup) {
                this.closePreview();
            }
        });

        // View full description button opens the modal
        this.previewViewFull.addEventListener('click', () => {
            this.closePreview();
            if (this.currentJobData) {
                this.showModal(this.currentJobData);
            }
        });

        // Close with Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.previewPopup.classList.contains('show')) {
                this.closePreview();
            }
        });
    }

    extractFirstParagraph(html) {
        if (!html) return 'No description available.';
        
        // Create a temporary div to parse HTML
        const temp = document.createElement('div');
        temp.innerHTML = html;
        
        // Try to get the first paragraph
        const firstP = temp.querySelector('p');
        if (firstP && firstP.textContent.trim().length > 0) {
            return firstP.outerHTML;
        }
        
        // If no paragraph, get first div or just truncate text
        const firstDiv = temp.querySelector('div');
        if (firstDiv && firstDiv.textContent.trim().length > 0) {
            return firstDiv.outerHTML;
        }
        
        // Fallback: get first 300 characters
        const text = temp.textContent.trim();
        if (text.length > 300) {
            return `<p>${text.substring(0, 300)}...</p>`;
        }
        
        return html;
    }

    showPreview(jobData) {
        this.currentJobData = jobData;
        
        // Extract and show first paragraph
        const firstParagraph = this.extractFirstParagraph(jobData.description);
        document.getElementById('previewText').innerHTML = firstParagraph;
        
        // Show preview popup
        this.previewPopup.classList.add('show');
    }

    closePreview() {
        this.previewPopup.classList.remove('show');
    }

    initTheme() {
        // Check for saved theme preference or default to light mode
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);
        
        // Remove no-transition class and inline styles after initial render
        setTimeout(() => {
            document.documentElement.classList.remove('no-transition');
            document.documentElement.style.backgroundColor = '';
        }, 50);
    }

    toggleTheme() {
        const currentTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
        const newTheme = currentTheme === 'light' ? 'dark' : 'light';
        this.setTheme(newTheme);
    }

    setTheme(theme) {
        // Apply theme class to html element
        if (theme === 'dark') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }
        
        // Save preference
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
        
        // Only check rank filters for InspireHEP source
        const selectedRanks = this.currentSource === 'inspirehep' ? 
            Array.from(document.querySelectorAll('.rank-filter input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.value) : [];
        
        this.allJobs.forEach(job => {
            const matchesSearch = this.matchesSearchTerm(job, searchTerm);
            const matchesFilter = this.matchesFilter(job, activeFilter);
            const matchesRank = this.currentSource === 'inspirehep' ? 
                this.matchesRankFilter(job, selectedRanks) : true;
            
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