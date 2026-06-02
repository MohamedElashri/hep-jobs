class JobsApp {
    constructor() {
        this.currentSource = localStorage.getItem('currentSource') || 'all';
        this.currentFilter = localStorage.getItem('jobsFilter') || 'active';
        this.currentView = localStorage.getItem('jobsView') || 'cards';
        this.currentSort = localStorage.getItem('jobsSort') || 'deadline';

        this.searchInput = document.getElementById('searchInput');
        this.sortSelect = document.getElementById('sortSelect');
        this.filterButtons = document.querySelectorAll('.filter-btn');
        this.viewButtons = document.querySelectorAll('.view-btn');
        this.rankFilters = document.querySelectorAll('.rank-filter input[type="checkbox"]');
        this.resultsSummary = document.getElementById('resultsSummary');
        this.emptyResults = document.getElementById('emptyResults');
        this.themeButtons = document.querySelectorAll('.theme-swatch');
        this.modal = document.getElementById('jobModal');
        this.modalClose = document.getElementById('modalClose');
        this.previewPopup = document.getElementById('previewPopup');
        this.previewClose = document.getElementById('previewClose');
        this.previewViewFull = document.getElementById('previewViewFull');
        this.currentJobData = null;

        this.navLinks = document.querySelectorAll('.nav-link');
        this.allView = document.getElementById('all-view');
        this.inspirehepView = document.getElementById('inspirehep-view');
        this.ajoView = document.getElementById('ajo-view');
        this.desyView = document.getElementById('desy-view');
        this.activeContainer = null;
        this.allJobs = [];

        this.initEventListeners();
        this.initTheme();
        this.initModal();
        this.initPreviewPopup();
        this.switchSource(this.currentSource);
    }

    decodeJsonAttribute(attrValue) {
        const decoded = attrValue
            .replace(/&#x27;/g, "'")
            .replace(/&amp;/g, "&");
        return JSON.parse(decoded);
    }

    initEventListeners() {
        this.searchInput.addEventListener('input', () => this.filterJobs());
        this.sortSelect.addEventListener('change', () => this.setSort(this.sortSelect.value));

        this.filterButtons.forEach(btn => {
            btn.addEventListener('click', () => this.setFilter(btn));
        });

        this.viewButtons.forEach(btn => {
            btn.addEventListener('click', () => this.setView(btn));
        });

        this.rankFilters.forEach(checkbox => {
            checkbox.addEventListener('change', () => this.filterJobs());
        });

        this.themeButtons.forEach(button => {
            button.addEventListener('click', () => this.setTheme(button.dataset.theme));
        });

        this.navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.switchSource(link.getAttribute('data-source'));
            });
        });
    }

    switchSource(source) {
        this.currentSource = source;
        localStorage.setItem('currentSource', source);

        this.navLinks.forEach(link => {
            link.classList.toggle('active', link.getAttribute('data-source') === source);
        });

        this.allView.classList.toggle('active', source === 'all');
        this.inspirehepView.classList.toggle('active', source === 'inspirehep');
        this.ajoView.classList.toggle('active', source === 'ajo');
        this.desyView.classList.toggle('active', source === 'desy');

        document.getElementById('rankFilters').style.display = source === 'inspirehep' ? 'block' : 'none';

        if (source === 'all') {
            this.populateAllView();
        }

        this.activeContainer = this.getContainerForSource(source);
        this.allJobs = Array.from(this.activeContainer.querySelectorAll('.job-card'));

        this.syncControls();
        this.updateStats();
        this.filterJobs();
    }

    getContainerForSource(source) {
        if (source === 'all') return document.getElementById('jobsContainerAll');
        if (source === 'inspirehep') return document.getElementById('jobsContainerInspireHEP');
        if (source === 'ajo') return document.getElementById('jobsContainerAJO');
        return document.getElementById('jobsContainerDESY');
    }

    syncControls() {
        this.filterButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-filter') === this.currentFilter);
        });

        this.viewButtons.forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-view') === this.currentView);
        });

        this.sortSelect.value = this.currentSort;
        this.applyViewClass();
    }

    updateStats() {
        const totalJobs = this.allJobs.length;
        const activeJobs = this.allJobs.filter(job => !job.classList.contains('expired')).length;
        const totalJobsEl = document.getElementById('totalJobs');
        const activeJobsEl = document.getElementById('activeJobs');

        if (totalJobsEl) totalJobsEl.textContent = totalJobs;
        if (activeJobsEl) activeJobsEl.textContent = activeJobs;
    }

    populateAllView() {
        const allContainer = document.getElementById('jobsContainerAll');
        const sourceContainers = [
            document.getElementById('jobsContainerInspireHEP'),
            document.getElementById('jobsContainerAJO'),
            document.getElementById('jobsContainerDESY')
        ];

        allContainer.innerHTML = '';

        sourceContainers.forEach(container => {
            Array.from(container.querySelectorAll('.job-card')).forEach(job => {
                allContainer.appendChild(job.cloneNode(true));
            });
        });
    }

    initModal() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('btn-view-full')) {
                const jobCard = e.target.closest('.job-card');
                if (jobCard) {
                    const jobData = this.decodeJsonAttribute(jobCard.getAttribute('data-job'));
                    this.showModal(jobData);
                }
            }
        });

        this.modalClose.addEventListener('click', () => this.closeModal());

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) {
                this.closeModal();
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.modal.classList.contains('show')) {
                this.closeModal();
            }
        });
    }

    showModal(jobData) {
        document.getElementById('modalTitle').textContent = jobData.title;
        document.getElementById('modalInstitution').textContent = jobData.institution;

        let metaHTML = '';
        metaHTML += `<div><strong>Source:</strong> ${jobData.source || 'InspireHEP'}</div>`;
        metaHTML += `<div><strong>Deadline:</strong> <span class="${jobData.isExpired ? 'expired-text' : ''}">${jobData.deadline}</span></div>`;

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

        const description = jobData.description || 'No description available.';
        document.getElementById('modalDescription').innerHTML = description;

        let actionsHTML = '';

        if (jobData.jobUrl) {
            const linkText = jobData.source === 'DESY' ? 'View on DESY' :
                           jobData.source === 'AcademicJobsOnline' ? 'View on AJO' :
                           'View on InspireHEP';
            actionsHTML += `<a href="${jobData.jobUrl}" target="_blank" class="btn-apply">${linkText}</a>`;
        } else if (jobData.urls && jobData.urls.length > 0) {
            actionsHTML += `<a href="${jobData.urls[0]}" target="_blank" class="btn-apply">External Link</a>`;
        }

        if (jobData.contact_email) {
            actionsHTML += `<a href="mailto:${jobData.contact_email}" class="btn-contact">Contact</a>`;
        }

        document.getElementById('modalActions').innerHTML = actionsHTML;

        this.modal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    closeModal() {
        this.modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    initPreviewPopup() {
        document.addEventListener('click', (e) => {
            if (e.target.closest('.job-description')) {
                const jobCard = e.target.closest('.job-card');
                if (jobCard) {
                    const jobData = this.decodeJsonAttribute(jobCard.getAttribute('data-job'));
                    this.showPreview(jobData);
                }
            }
        });

        this.previewClose.addEventListener('click', () => this.closePreview());

        this.previewPopup.addEventListener('click', (e) => {
            if (e.target === this.previewPopup) {
                this.closePreview();
            }
        });

        this.previewViewFull.addEventListener('click', () => {
            this.closePreview();
            if (this.currentJobData) {
                this.showModal(this.currentJobData);
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.previewPopup.classList.contains('show')) {
                this.closePreview();
            }
        });
    }

    extractFirstParagraph(html) {
        if (!html) return 'No description available.';

        const temp = document.createElement('div');
        temp.innerHTML = html;

        const firstP = temp.querySelector('p');
        if (firstP && firstP.textContent.trim().length > 0) {
            return firstP.outerHTML;
        }

        const firstDiv = temp.querySelector('div');
        if (firstDiv && firstDiv.textContent.trim().length > 0) {
            return firstDiv.outerHTML;
        }

        const text = temp.textContent.trim();
        if (text.length > 300) {
            return `<p>${text.substring(0, 300)}...</p>`;
        }

        return html;
    }

    showPreview(jobData) {
        this.currentJobData = jobData;

        const firstParagraph = this.extractFirstParagraph(jobData.description);
        document.getElementById('previewText').innerHTML = firstParagraph;

        this.previewPopup.classList.add('show');
    }

    closePreview() {
        this.previewPopup.classList.remove('show');
    }

    initTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.setTheme(savedTheme);

        setTimeout(() => {
            document.documentElement.classList.remove('no-transition');
            document.documentElement.style.backgroundColor = '';
        }, 50);
    }

    normalizeTheme(theme) {
        const validThemes = ['light', 'night', 'collider', 'contrast'];
        if (theme === 'dark') return 'night';
        return validThemes.includes(theme) ? theme : 'light';
    }

    setTheme(theme) {
        const nextTheme = this.normalizeTheme(theme);
        document.documentElement.dataset.theme = nextTheme;

        if (nextTheme !== 'light') {
            document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.remove('dark');
        }

        localStorage.setItem('theme', nextTheme);

        this.themeButtons.forEach(button => {
            const isActive = button.dataset.theme === nextTheme;
            button.classList.toggle('active', isActive);
            button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
    }

    setFilter(button) {
        this.currentFilter = button.getAttribute('data-filter');
        localStorage.setItem('jobsFilter', this.currentFilter);
        this.syncControls();
        this.filterJobs();
    }

    setView(button) {
        this.currentView = button.getAttribute('data-view');
        localStorage.setItem('jobsView', this.currentView);
        this.syncControls();
        this.filterJobs();
    }

    setSort(sortValue) {
        this.currentSort = sortValue;
        localStorage.setItem('jobsSort', sortValue);
        this.filterJobs();
    }

    filterJobs() {
        if (!this.activeContainer) return;

        const searchTerm = this.searchInput.value.trim().toLowerCase();
        const selectedRanks = this.currentSource === 'inspirehep'
            ? Array.from(document.querySelectorAll('.rank-filter input[type="checkbox"]:checked'))
                .map(checkbox => checkbox.value)
            : [];

        this.clearGroupHeadings();
        this.sortJobs();

        let visibleCount = 0;

        this.allJobs.forEach(job => {
            const matchesSearch = this.matchesSearchTerm(job, searchTerm);
            const matchesFilter = this.matchesFilter(job, this.currentFilter);
            const matchesRank = this.currentSource === 'inspirehep'
                ? this.matchesRankFilter(job, selectedRanks)
                : true;
            const isVisible = matchesSearch && matchesFilter && matchesRank;

            job.classList.toggle('hidden', !isVisible);
            if (isVisible) visibleCount += 1;
        });

        this.applyViewClass();

        if (this.currentView === 'deadlines') {
            this.renderDeadlineGroups();
        }

        this.updateResultsSummary(visibleCount);
        this.emptyResults.classList.toggle('hidden', visibleCount > 0);
    }

    sortJobs() {
        const sortedJobs = [...this.allJobs].sort((a, b) => this.compareJobs(a, b));
        sortedJobs.forEach(job => this.activeContainer.appendChild(job));
        this.allJobs = sortedJobs;
    }

    compareJobs(a, b) {
        const aExpired = a.classList.contains('expired');
        const bExpired = b.classList.contains('expired');

        if (this.currentFilter !== 'expired' && aExpired !== bExpired) {
            return aExpired ? 1 : -1;
        }

        if (this.currentSort === 'updated') {
            const diff = this.dateValue(b.dataset.updated, 0) - this.dateValue(a.dataset.updated, 0);
            if (diff !== 0) return diff;
        } else if (this.currentSort === 'source') {
            const sourceDiff = this.sourceLabel(a.dataset.source).localeCompare(this.sourceLabel(b.dataset.source));
            if (sourceDiff !== 0) return sourceDiff;
        } else if (this.currentSort === 'institution') {
            const institutionDiff = (a.dataset.institution || '').localeCompare(b.dataset.institution || '');
            if (institutionDiff !== 0) return institutionDiff;
        } else {
            const diff = this.dateValue(a.dataset.deadline, Number.POSITIVE_INFINITY) -
                this.dateValue(b.dataset.deadline, Number.POSITIVE_INFINITY);
            if (diff !== 0) return diff;
        }

        return a.textContent.localeCompare(b.textContent);
    }

    applyViewClass() {
        if (!this.activeContainer) return;

        this.activeContainer.classList.toggle('view-list', this.currentView === 'list');
        this.activeContainer.classList.toggle('view-deadlines', this.currentView === 'deadlines');
        this.activeContainer.classList.toggle('view-cards', this.currentView === 'cards');
    }

    clearGroupHeadings() {
        if (!this.activeContainer) return;

        this.activeContainer.querySelectorAll('.job-group-heading').forEach(heading => heading.remove());
    }

    renderDeadlineGroups() {
        const visibleJobs = this.allJobs.filter(job => !job.classList.contains('hidden'));
        const groupCounts = visibleJobs.reduce((counts, job) => {
            const group = this.getDeadlineGroup(job);
            counts[group] = (counts[group] || 0) + 1;
            return counts;
        }, {});

        let currentGroup = '';

        visibleJobs.forEach(job => {
            const group = this.getDeadlineGroup(job);
            if (group !== currentGroup) {
                currentGroup = group;
                const heading = document.createElement('div');
                heading.className = 'job-group-heading';
                heading.textContent = `${group} (${groupCounts[group]})`;
                this.activeContainer.insertBefore(heading, job);
            }
        });
    }

    getDeadlineGroup(job) {
        if (job.classList.contains('expired')) return 'Expired';

        const deadline = this.parseDate(job.dataset.deadline);
        if (!deadline) return 'No deadline';

        const days = this.daysUntil(deadline);
        if (days <= 7) return 'Due this week';
        if (days <= 14) return 'Due next week';
        if (days <= 31) return 'Due this month';
        return 'Later deadlines';
    }

    matchesSearchTerm(job, searchTerm) {
        if (!searchTerm) return true;
        return job.textContent.toLowerCase().includes(searchTerm);
    }

    matchesFilter(job, filter) {
        switch (filter) {
            case 'active':
                return !job.classList.contains('expired');
            case 'new':
                return job.classList.contains('new-job') && !job.classList.contains('expired');
            case 'closing-soon':
                return this.isClosingSoon(job);
            case 'expired':
                return job.classList.contains('expired');
            case 'all':
            default:
                return true;
        }
    }

    matchesRankFilter(job, selectedRanks) {
        if (selectedRanks.length === 0) return true;

        const jobRanks = job.dataset.ranks ? job.dataset.ranks.split(',') : [];
        if (jobRanks.length === 0) return selectedRanks.includes('OTHER');

        return jobRanks.some(rank => selectedRanks.includes(rank.trim()));
    }

    isClosingSoon(job) {
        if (job.classList.contains('expired')) return false;

        const deadline = this.parseDate(job.dataset.deadline);
        if (!deadline) return false;

        const days = this.daysUntil(deadline);
        return days >= 0 && days <= 14;
    }

    updateResultsSummary(visibleCount) {
        const total = this.allJobs.length;
        const expiredCount = this.allJobs.filter(job => job.classList.contains('expired')).length;
        const source = this.currentSource === 'all' ? 'all sources' : this.sourceLabel(this.currentSource);
        const filterLabel = this.filterLabel(this.currentFilter);
        const hiddenExpired = this.currentFilter === 'active' && expiredCount > 0
            ? ` · ${expiredCount} expired hidden`
            : '';

        this.resultsSummary.textContent = `Showing ${visibleCount} of ${total} ${filterLabel} jobs from ${source}${hiddenExpired}`;
    }

    filterLabel(filter) {
        const labels = {
            active: 'active',
            new: 'new',
            'closing-soon': 'closing soon',
            expired: 'expired',
            all: 'total'
        };

        return labels[filter] || 'matching';
    }

    sourceLabel(source) {
        const labels = {
            all: 'All Jobs',
            inspirehep: 'InspireHEP',
            ajo: 'AcademicJobsOnline',
            desy: 'DESY'
        };

        return labels[source] || source || 'Unknown source';
    }

    parseDate(dateString) {
        if (!dateString) return null;

        const date = new Date(dateString);
        return Number.isNaN(date.getTime()) ? null : date;
    }

    dateValue(dateString, fallback) {
        const date = this.parseDate(dateString);
        return date ? date.getTime() : fallback;
    }

    daysUntil(date) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const deadline = new Date(date);
        deadline.setHours(0, 0, 0, 0);

        return Math.ceil((deadline - today) / (1000 * 60 * 60 * 24));
    }
}

document.addEventListener('DOMContentLoaded', () => {
    new JobsApp();
});
