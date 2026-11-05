/**
 * GPU Manager for distributed transaction processing across GPU cluster.
 * Implements task distribution, load monitoring, auto-scaling, and CPU fallback.
 *
 * NOTE: This manager is a SIMULATED GPU cluster (in-memory only, no real GPU
 * kernels). It is therefore gated to non-production environments; in production
 * it refuses to distribute/process tasks unless ALLOW_SIMULATION=true is set.
 */

const securityConfig = require('../config/security');

/**
 * GPU Manager class for managing GPU cluster operations.
 */
class GPUManager {
    constructor() {
        // GPU cluster configuration
        this.clusterSize = 4;
        this.maxClusterSize = 16;
        this.minClusterSize = 1;
        
        // GPU nodes state
        this.nodes = [];
        this.initializeNodes();
        
        // Task queue for pending tasks
        this.taskQueue = [];
        
        // Processing metrics
        this.metrics = {
            totalTasksProcessed: 0,
            totalTasksFailed: 0,
            totalProcessingTimeMs: 0,
            avgProcessingTimeMs: 0,
            fallbackCount: 0,
            lastMetricsUpdate: Date.now()
        };
        
        // Load thresholds for auto-scaling
        this.utilizationThresholdHigh = 0.8;
        this.utilizationThresholdLow = 0.3;
        this.scaleUpCooldown = 30000; // 30 seconds
        this.scaleDownCooldown = 60000; // 60 seconds
        this.lastScaleUpTime = 0;
        this.lastScaleDownTime = 0;
        
        // Fallback configuration
        this.fallbackEnabled = true;
        this.gpuAvailable = true;
        
        // Processing history for metrics
        this.processingHistory = [];
        this.maxHistorySize = 1000;
    }

    /**
     * Initialize GPU nodes in the cluster.
     */
    initializeNodes() {
        this.nodes = [];
        for (let i = 0; i < this.clusterSize; i++) {
            this.nodes.push({
                id: `gpu-${i}`,
                status: 'idle',
                currentTask: null,
                tasksProcessed: 0,
                lastActive: Date.now(),
                utilization: 0
            });
        }
    }

    /**
     * Distribute tasks across GPU cluster.
     * @param {Array} batch - Array of tasks to distribute
     * @returns {Object} Distribution results
     */
    distributeTasks(batch) {
        // Fail-closed: refuse to run the simulated cluster outside permitted envs
        if (!securityConfig.isSimulationAllowed()) {
            return {
                success: false,
                distributed: [],
                skipped: [],
                totalTasks: Array.isArray(batch) ? batch.length : 0,
                nodesUsed: 0,
                message: securityConfig.simulation.disabledMessage
            };
        }

        if (!batch || !Array.isArray(batch) || batch.length === 0) {
            return {
                success: true,
                distributed: [],
                skipped: [],
                totalTasks: 0,
                message: 'Empty or invalid batch'
            };
        }

        const distributed = [];
        const skipped = [];

        for (const task of batch) {
            const node = this.findLeastLoadedNode();
            
            if (node) {
                // Assign task to node
                node.status = 'busy';
                node.currentTask = task.id || `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
                node.tasksProcessed++;
                node.lastActive = Date.now();
                
                // Update utilization
                node.utilization = this.calculateNodeUtilization(node);
                
                distributed.push({
                    taskId: task.id || node.currentTask,
                    nodeId: node.id,
                    status: 'assigned'
                });
            } else {
                skipped.push({
                    taskId: task.id || `task_${Date.now()}`,
                    reason: 'No available GPU nodes'
                });
            }
        }

        // Update global metrics
        this.metrics.totalTasksProcessed += distributed.length;
        this.metrics.lastMetricsUpdate = Date.now();

        return {
            success: true,
            distributed,
            skipped,
            totalTasks: batch.length,
            nodesUsed: this.nodes.filter(n => n.status === 'busy').length
        };
    }

    /**
     * Find the least loaded GPU node.
     * @returns {Object|null} The least loaded node or null if all are busy
     */
    findLeastLoadedNode() {
        // Filter idle nodes
        const idleNodes = this.nodes.filter(n => n.status === 'idle');
        
        if (idleNodes.length === 0) {
            // If no idle nodes, find the one with lowest utilization
            return this.nodes.reduce((min, node) => 
                node.utilization < min.utilization ? node : min
            );
        }
        
        // Return the first idle node (or the one with least tasks)
        return idleNodes.reduce((min, node) => 
            node.tasksProcessed < min.tasksProcessed ? node : min
        );
    }

    /**
     * Calculate utilization for a specific node.
     * @param {Object} node - The GPU node
     * @returns {number} Utilization as a value between 0 and 1
     */
    calculateNodeUtilization(node) {
        // Simple utilization calculation based on task count
        const maxTasks = 10;
        return Math.min(node.tasksProcessed / maxTasks, 1);
    }

    /**
     * Monitor cluster utilization.
     * @returns {Object} Current utilization metrics
     */
    monitorUtilization() {
        const totalNodes = this.nodes.length;
        const busyNodes = this.nodes.filter(n => n.status === 'busy').length;
        const idleNodes = this.nodes.filter(n => n.status === 'idle').length;
        
        // Calculate average utilization
        const totalUtilization = this.nodes.reduce((sum, node) => sum + node.utilization, 0);
        const avgUtilization = totalNodes > 0 ? totalUtilization / totalNodes : 0;
        
        // Calculate cluster capacity
        const clusterCapacity = {
            total: totalNodes,
            busy: busyNodes,
            idle: idleNodes,
            utilization: avgUtilization
        };

        return {
            timestamp: new Date().toISOString(),
            clusterCapacity,
            nodes: this.nodes.map(n => ({
                id: n.id,
                status: n.status,
                utilization: n.utilization,
                tasksProcessed: n.tasksProcessed,
                currentTask: n.currentTask
            })),
            metrics: {
                avgUtilization: avgUtilization,
                totalTasksProcessed: this.metrics.totalTasksProcessed,
                totalTasksFailed: this.metrics.totalTasksFailed
            }
        };
    }

    /**
     * Get processing metrics.
     * @returns {Object} Processing metrics
     */
    getMetrics() {
        const now = Date.now();
        const uptimeMs = now - this.metrics.lastMetricsUpdate;
        
        return {
            timestamp: new Date().toISOString(),
            clusterSize: this.clusterSize,
            utilization: this.monitorUtilization().clusterCapacity.utilization,
            tasksProcessed: this.metrics.totalTasksProcessed,
            tasksFailed: this.metrics.totalTasksFailed,
            avgProcessingTimeMs: this.metrics.avgProcessingTimeMs,
            fallbackCount: this.metrics.fallbackCount,
            uptimeMs: uptimeMs,
            processingHistory: this.processingHistory.slice(-this.maxHistorySize)
        };
    }

    /**
     * Scale the GPU cluster up or down.
     * @param {boolean} up - true to scale up, false to scale down
     * @returns {Object} Scaling result
     */
    scaleCluster(up) {
        // Fail-closed: the simulated cluster cannot be scaled in production
        if (!securityConfig.isSimulationAllowed()) {
            return {
                success: false,
                action: up ? 'scale_up' : 'scale_down',
                currentSize: this.clusterSize,
                message: securityConfig.simulation.disabledMessage
            };
        }

        const now = Date.now();
        
        if (up) {
            // Scale up
            if (this.clusterSize >= this.maxClusterSize) {
                return {
                    success: false,
                    action: 'scale_up',
                    currentSize: this.clusterSize,
                    message: 'Cluster already at maximum size'
                };
            }
            
            // Check cooldown
            if (now - this.lastScaleUpTime < this.scaleUpCooldown) {
                return {
                    success: false,
                    action: 'scale_up',
                    currentSize: this.clusterSize,
                    message: 'Scale up cooldown period not elapsed'
                };
            }
            
            // Add new nodes
            const nodesToAdd = Math.min(
                this.maxClusterSize - this.clusterSize,
                Math.ceil(this.clusterSize / 2)
            );
            
            for (let i = 0; i < nodesToAdd; i++) {
                const newNodeId = `gpu-${this.clusterSize + i}`;
                this.nodes.push({
                    id: newNodeId,
                    status: 'idle',
                    currentTask: null,
                    tasksProcessed: 0,
                    lastActive: Date.now(),
                    utilization: 0
                });
            }
            
            this.clusterSize += nodesToAdd;
            this.lastScaleUpTime = now;
            
            return {
                success: true,
                action: 'scale_up',
                previousSize: this.clusterSize - nodesToAdd,
                currentSize: this.clusterSize,
                nodesAdded: nodesToAdd
            };
            
        } else {
            // Scale down
            if (this.clusterSize <= this.minClusterSize) {
                return {
                    success: false,
                    action: 'scale_down',
                    currentSize: this.clusterSize,
                    message: 'Cluster already at minimum size'
                };
            }
            
            // Check cooldown
            if (now - this.lastScaleDownTime < this.scaleDownCooldown) {
                return {
                    success: false,
                    action: 'scale_down',
                    currentSize: this.clusterSize,
                    message: 'Scale down cooldown period not elapsed'
                };
            }
            
            // Remove idle nodes (preferably from the end)
            const nodesToRemove = Math.min(
                this.clusterSize - this.minClusterSize,
                this.nodes.filter(n => n.status === 'idle').length,
                Math.ceil(this.clusterSize / 4)
            );
            
            if (nodesToRemove === 0) {
                return {
                    success: false,
                    action: 'scale_down',
                    currentSize: this.clusterSize,
                    message: 'No idle nodes available for removal'
                };
            }
            
            // Remove nodes from the end
            this.nodes.splice(this.clusterSize - nodesToRemove, nodesToRemove);
            this.clusterSize -= nodesToRemove;
            this.lastScaleDownTime = now;
            
            return {
                success: true,
                action: 'scale_down',
                previousSize: this.clusterSize + nodesToRemove,
                currentSize: this.clusterSize,
                nodesRemoved: nodesToRemove
            };
        }
    }

    /**
     * Get current cluster size.
     * @returns {number} Number of GPU nodes in cluster
     */
    getClusterSize() {
        return this.clusterSize;
    }

    /**
     * Fallback to CPU processing.
     * @param {Object} task - Task to process on CPU
     * @returns {Object} Processing result
     */
    fallbackToCPU(task) {
        // Fail-closed: CPU fallback is part of the simulated processing path
        if (!securityConfig.isSimulationAllowed()) {
            return {
                success: false,
                reason: securityConfig.simulation.disabledMessage
            };
        }

        if (!this.fallbackEnabled) {
            return {
                success: false,
                reason: 'CPU fallback is disabled'
            };
        }

        this.metrics.fallbackCount++;
        this.metrics.totalTasksFailed++;
        
        // Simulate CPU processing
        const startTime = Date.now();
        
        // CPU processing simulation (synchronous for simplicity)
        const result = this.processTaskOnCPU(task);
        
        const processingTime = Date.now() - startTime;
        
        // Update metrics
        this.metrics.totalProcessingTimeMs += processingTime;
        this.metrics.avgProcessingTimeMs = 
            this.metrics.totalProcessingTimeMs / this.metrics.totalTasksProcessed;
        
        // Record in history
        this.processingHistory.push({
            timestamp: new Date().toISOString(),
            taskId: task.id,
            method: 'cpu',
            processingTimeMs: processingTime,
            success: result.success
        });
        
        // Trim history if needed
        if (this.processingHistory.length > this.maxHistorySize) {
            this.processingHistory.shift();
        }
        
        return {
            success: result.success,
            taskId: task.id,
            method: 'cpu',
            processingTimeMs: processingTime,
            result: result.data
        };
    }

    /**
     * Process a task on CPU (fallback method).
     * @param {Object} task - Task to process
     * @returns {Object} Processing result
     */
    processTaskOnCPU(task) {
        // Simulate CPU processing
        try {
            // Basic task processing simulation
            const processedData = {
                taskId: task.id,
                processed: true,
                timestamp: new Date().toISOString(),
                source: 'cpu_fallback'
            };
            
            return {
                success: true,
                data: processedData
            };
        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Mark a task as completed.
     * @param {string} taskId - Task ID
     * @param {boolean} success - Whether processing was successful
     * @param {number} processingTimeMs - Processing time in milliseconds
     */
    completeTask(taskId, success, processingTimeMs) {
        // Find the node that processed this task
        const node = this.nodes.find(n => n.currentTask === taskId);
        
        if (node) {
            node.status = 'idle';
            node.currentTask = null;
            node.utilization = this.calculateNodeUtilization(node);
            
            if (success) {
                this.metrics.totalTasksProcessed++;
            } else {
                this.metrics.totalTasksFailed++;
                
                // If GPU processing failed and fallback is enabled, mark GPU as unavailable
                if (this.fallbackEnabled) {
                    this.gpuAvailable = false;
                }
            }
            
            // Update average processing time
            this.metrics.totalProcessingTimeMs += processingTimeMs;
            this.metrics.avgProcessingTimeMs = 
                this.metrics.totalProcessingTimeMs / this.metrics.totalTasksProcessed;
            
            // Record in history
            this.processingHistory.push({
                timestamp: new Date().toISOString(),
                taskId: taskId,
                method: 'gpu',
                processingTimeMs: processingTimeMs,
                success: success
            });
            
            // Trim history if needed
            if (this.processingHistory.length > this.maxHistorySize) {
                this.processingHistory.shift();
            }
        }
    }

    /**
     * Check if GPU processing is available.
     * @returns {boolean} True if GPU is available
     */
    isGPUAvailable() {
        // The cluster is simulated — report unavailable outside permitted envs
        if (!securityConfig.isSimulationAllowed()) {
            return false;
        }
        return this.gpuAvailable && this.clusterSize > 0;
    }

    /**
     * Reset GPU manager state (useful for testing).
     */
    reset() {
        this.clusterSize = 4;
        this.initializeNodes();
        this.taskQueue = [];
        this.metrics = {
            totalTasksProcessed: 0,
            totalTasksFailed: 0,
            totalProcessingTimeMs: 0,
            avgProcessingTimeMs: 0,
            fallbackCount: 0,
            lastMetricsUpdate: Date.now()
        };
        this.processingHistory = [];
        this.gpuAvailable = true;
        this.lastScaleUpTime = 0;
        this.lastScaleDownTime = 0;
    }

    /**
     * Get GPU manager configuration.
     * @returns {Object} Configuration
     */
    getConfig() {
        return {
            clusterSize: this.clusterSize,
            maxClusterSize: this.maxClusterSize,
            minClusterSize: this.minClusterSize,
            fallbackEnabled: this.fallbackEnabled,
            gpuAvailable: this.gpuAvailable,
            utilizationThresholdHigh: this.utilizationThresholdHigh,
            utilizationThresholdLow: this.utilizationThresholdLow,
            scaleUpCooldown: this.scaleUpCooldown,
            scaleDownCooldown: this.scaleDownCooldown
        };
    }

    /**
     * Update GPU manager configuration.
     * @param {Object} config - Configuration to update
     */
    updateConfig(config) {
        if (config.clusterSize !== undefined) {
            this.clusterSize = Math.max(this.minClusterSize, Math.min(this.maxClusterSize, config.clusterSize));
        }
        if (config.maxClusterSize !== undefined) {
            this.maxClusterSize = config.maxClusterSize;
        }
        if (config.minClusterSize !== undefined) {
            this.minClusterSize = config.minClusterSize;
        }
        if (config.fallbackEnabled !== undefined) {
            this.fallbackEnabled = config.fallbackEnabled;
        }
        if (config.utilizationThresholdHigh !== undefined) {
            this.utilizationThresholdHigh = config.utilizationThresholdHigh;
        }
        if (config.utilizationThresholdLow !== undefined) {
            this.utilizationThresholdLow = config.utilizationThresholdLow;
        }
    }
}

module.exports = new GPUManager();
