@@ .. @@
// Add activity item dynamically (for real-time updates)
function addActivityItem(activity) {
    const activityList = document.getElementById('activityList');
    if (!activityList) return;
    
    // Remove loading or empty state
    const loading = activityList.querySelector('.activity-loading, .activity-empty');
    if (loading) {
        loading.remove();
    }
    
    const timeAgo = getTimeAgo(new Date(activity.createdAt));
    const statusIcon = getStatusIcon(activity.status);
    const statusClass = activity.status;
+    
+    // Ensure we display the actual meeting name, not just "Meeting"
+    const displayName = activity.meetingName && activity.meetingName !== 'Unnamed Meeting' 
+        ? activity.meetingName 
+        : `Meeting ${activity.meetingId?.substring(0, 8) || ''}`;
    
    const activityHTML = `
        <div class="activity-item activity-new">
            <div class="activity-avatar">
                <img src="${currentUser?.profilePicture || 'https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=100&h=100&fit=crop'}" alt="User">
            </div>
            <div class="activity-content">
-                <div class="activity-title">${activity.meetingName}</div>
+                <div class="activity-title">${displayName}</div>
                <div class="activity-time">${timeAgo}</div>
                ${activity.duration ? `<div class="activity-duration">${activity.duration} minutes</div>` : ''}
            </div>
            <div class="activity-status ${statusClass}">
                <i class="${statusIcon}"></i>
            </div>
        </div>
    `;
    
    // Add to top of list
    activityList.insertAdjacentHTML('afterbegin', activityHTML);
    
    // Remove the 'new' class after animation
    setTimeout(() => {
        const newItem = activityList.querySelector('.activity-new');
        if (newItem) {
            newItem.classList.remove('activity-new');
        }
    }, 1000);
}