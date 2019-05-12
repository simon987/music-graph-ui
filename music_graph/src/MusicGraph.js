import * as d3 from 'd3'

export const nodeUtils = {
    getNodeType: function (labels) {
        if (labels.find(l => l === 'Tag')) {
            return 'Tag'
        } else if (labels.find(l => l === 'Group')) {
            return 'Group'
        } else if (labels.find(l => l === 'Artist')) {
            return 'Artist'
        }
        return undefined
    }
}

export function MusicGraph(data) {
    const width = window.innerWidth - 7
    const height = window.innerHeight - 7
    this._data = data

    this.nodeById = new Map()
    this.expandedNodes = new Set()
    this.nodes = []
    this.links = []
    this._originSet = false

    this.svg = d3.select('body')
        .append('svg')
        .attr('width', width)
        .attr('height', height)

    this.zoomed = () => {
        this.container.attr('transform', d3.event.transform)
    }

    this.svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .classed('pan-rect', true)
        .style('fill', 'none')
        .call(d3.zoom()
            .scaleExtent([1 / 10, 5])
            .on('zoom', this.zoomed))

    this.container = this.svg.append('g').attr('id', 'container')

    this.container.append('g')
        .attr('id', 'links')
    this.container.append('g')
        .attr('id', 'nodes')
    this.container.append('g')
        .attr('id', 'labels')

    this.dragStarted = (d) => {
        if (!d3.event.active) {
            this.simulation.alphaTarget(0.3).restart()
        }
        d.fx = d.x
        d.fy = d.y
    }

    this.dragged = (d) => {
        d.fx = d3.event.x
        d.fy = d3.event.y
    }

    this.dragEnded = (d) => {
        if (!d3.event.active) {
            this.simulation.alphaTarget(0)
        }

        d.fx = null
        d.fy = null
    }

    this.nodeHover = (d) => {
        this._data.hoverArtist = d

        let srcLinks = this.links.filter(link => link.source.id === d.id)
        let targetLinks = this.links.filter(link => link.target.id === d.id)
        this._data.hoverLinks = srcLinks.map(l => {
            return {
                match: (l.weight * 100).toFixed(2) + '%',
                other: l.target
            }
        }).concat(targetLinks.map(l => {
            return {
                match: (l.weight * 100).toFixed(2) + '%',
                other: l.source
            }
        }))

        this.svg.classed('hover', true)

        this.link.classed('selected', link =>
            link.source.id === d.id || link.target.id === d.id)

        this.node.classed('selected', n =>
            n.sourceLinks.has(d.id) ||
            n.targetLinks.has(d.id))

        this.label.classed('selected', n =>
            n.sourceLinks.has(d.id) ||
            n.targetLinks.has(d.id) ||
            n.id === d.id)

        this.node.classed('hover', n => n.id === d.id)
    }

    this.nodeOut = () => {
        this.svg.classed('hover', false)
        this.label.classed('selected', false)
        this.link.classed('selected', false)
        this.node.classed('selected', false)
        this.node.classed('hover', false)
    }

    this.nodeDbClick = (d) => {
        if (this.expandedNodes.has(d.id)) {
            return
        }

        this.expandedNodes.add(d.id)
        this.expandArtist(d.mbid)
    }

    this.simulation = d3.forceSimulation()
        .force('charge', d3.forceManyBody())
        .force('collide', d3.forceCollide()
            .radius(50)
            .strength(1))
        .force('center', d3.forceCenter(width / 2, height / 2))

    this.simulation.stop()

    this.simulation.on('tick', () => {
        this.link
            .attr('x1', d => d.source.x)
            .attr('y1', d => d.source.y)
            .attr('x2', d => d.target.x)
            .attr('y2', d => d.target.y)
        this.node
            .attr('cx', d => d.x)
            .attr('cy', d => d.y)
        this.label
            .attr('x', d => d.x)
            .attr('y', d => d.y)
    })

    /**
     * Add nodes to the graph
     */
    this.addNodes = function (newNodes, relations, originId) {
        // Update node map, ignore existing nodes
        let nodesToAdd = []
        newNodes.forEach(d => {
            if (this.nodeById.has(d.id)) {
                return
            }
            this.nodeById.set(d.id, d)

            if (this._originSet && originId) {
                // Set new nodes initial position
                let centerNode = this.nodeById.get(originId)
                centerNode.fx = centerNode.x
                centerNode.fy = centerNode.y
                d.x = centerNode.x
                d.y = centerNode.y
                setTimeout(() => {
                    centerNode.fx = null
                    centerNode.fy = null
                }, 600)
            }

            nodesToAdd.push(d)
        })

        // Convert {id, id} relation to {node, node}
        let linksToAdd = relations.map(({weight, source, target}) => ({
            source: this.nodeById.get(source),
            target: this.nodeById.get(target),
            weight: weight
        }))

        // Update source/targetLinks
        for (const {source, target} of linksToAdd) {
            source.sourceLinks.add(target.id)
            target.targetLinks.add(source.id)
        }

        this.nodes.push(...nodesToAdd)
        this.links.push(...linksToAdd)

        if (!this._originSet) {
            this._setOrigin()
            this._originSet = true
        }

        this._update()
    }

    /**
     * Remove nodes from the graph
     */
    this.removeNodes = function (idsToRemove) {
        let idSetToRemove = new Set(idsToRemove)

        idsToRemove.forEach(id => {
            // Update targetLinks
            Array.from(this.nodeById.get(id).sourceLinks)
                .map(srcId => this.nodeById.get(srcId))
                .forEach(target => {
                    target.targetLinks.delete(id)
                })

            this.nodeById.delete(id)
        })

        // Remove links
        this.links = this.links.filter(l =>
            !idSetToRemove.has(l.target.id) &&
            !idSetToRemove.has(l.source.id)
        )

        // Remove nodes
        this.nodes = this.nodes.filter(d => !idSetToRemove.has(d.id))

        this._update()
    }

    this._update = function () {
        this.simulation.nodes(this.nodes)
        this.simulation
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .strength(l => l.weight)
                .distance(d => Math.min(
                    (1.2 / d.weight) * (94 * this.expandedNodes.size))
                )
            )
        this.simulation
            .restart()

        // Add new links
        this.link = this.container.select('#links')
            .selectAll('.link')
            .data(this.links)
        let linkEnter = this.link
            .enter()
            .append('line')
            .classed('link', true)
        this.link = linkEnter.merge(this.link)

        // Add new nodes
        this.node = this.container.select('#nodes')
            .selectAll('.node')
            .attr('stroke', d => this._getNodeColor(d))
            .data(this.nodes)
        let nodeEnter = this.node
            .enter()
            .append('circle')
            .classed('node', true)
            .attr('r', 35)
            .attr('stroke', d => this._getNodeColor(d))
            .call(d3.drag()
                .on('start', this.dragStarted)
                .on('drag', this.dragged)
                .on('end', this.dragEnded))
            .on('mouseover', this.nodeHover)
            .on('mouseout', this.nodeOut)
            .on('dblclick', this.nodeDbClick)
        this.node = nodeEnter.merge(this.node)

        // Add new labels
        this.label = this.container.select('#labels')
            .selectAll('.label')
            .data(this.nodes)
        let labelEnter = this.label
            .enter()
            .append('text')
            .text(d => d.name)
            .classed('label', true)
        this.label = labelEnter.merge(this.label)
    }

    this.setupKeyBindings = function () {
        document.body.onkeydown = (e) => {
            let isPanMode = this.svg.classed('pan-mode')

            if (e.key === 'q') {
                this.svg.classed('pan-mode', !isPanMode)
            } else if (e.key === 'Escape') {
                this.svg.classed('pan-mode', false)
            }
        }
    }

    this._setOrigin = function () {
        // Set origin node in center
        this.originNode = this.simulation.nodes().find(node => node.id === this.originArtist.id)
        this.originNode.fx = width / 2
        this.originNode.fy = height / 2

        setTimeout(() => {
            this.originNode.fx = null
            this.originNode.fy = null
        }, 500)

        // Remember that we expanded origin node
        this.expandedNodes.add(this.originNode.id)
    }

    this._getNodeColor = function (node) {
        if (this.expandedNodes.has(node.id)) {
            return '#1cb3c8'
        }
        return null
    }

    this._getNodeRadius = function (node) {
        // Unused
    }

    this.expandArtist = function (mbid) {
        // todo use http client
        d3.json('https://mm.simon987.net/api/artist/related/' + mbid)
            .then((r) => {
                this.originArtist = r.artists.find(a => a.mbid === mbid)

                const nodes = r.artists.map((row) => {
                    return {
                        id: row.id,
                        mbid: row.mbid,
                        name: row.name,
                        listeners: row.listeners,
                        type: nodeUtils.getNodeType(row.labels),
                        sourceLinks: new Set(),
                        targetLinks: new Set()
                    }
                })

                this.addNodes(nodes, r.relations, this.originArtist.id)
            })
    }

    this._update()
    this.setupKeyBindings()
}