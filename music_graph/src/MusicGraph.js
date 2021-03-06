import * as d3 from 'd3'
import icons from './icons'
import {fitCaptionIntoCircle} from './graphGeometry'
import config from './graphConfig'

// TODO: export somewhere else
const arc = function (radius, itemNumber, itemCount, width) {
    itemNumber = itemNumber - 1

    const startAngle = ((2 * Math.PI) / itemCount) * itemNumber
    const endAngle = startAngle + (2 * Math.PI) / itemCount
    const innerRadius = Math.max(radius + 8, 20)
    return d3.arc()
        .innerRadius(innerRadius)
        .outerRadius(innerRadius + width)
        .startAngle(startAngle)
        .endAngle(endAngle)
        .padAngle(0.09)
}

export function MusicGraph(data) {
    let width = window.innerWidth - 7
    let height = window.innerHeight - 7

    window.onresize = () => {
        width = window.innerWidth - 7
        height = window.innerHeight - 7
        this.svg
            .attr('width', width)
            .attr('height', height)
        this.panRect
            .attr('width', width)
            .attr('height', height)
        this.dismissRect
            .attr('width', width)
            .attr('height', height)
    }

    this._data = data
    this.api = this._data.api

    this.nodeById = new Map()
    this.expandedNodes = new Set()
    this.nodeCount = 0
    this.nodes = []
    this.links = []
    this._originSet = false

    this.simulation = d3.forceSimulation()
        .force('charge', d3.forceManyBody())
        .force('collide', d3.forceCollide()
            .radius(35)
            .strength(1))
        .force('center', d3.forceCenter(width / 2, height / 2))

    this.zoomed = () => {
        this.container.attr('transform', d3.event.transform)
        this.dismiss()
    }

    this.dismiss = () => {
        if (this.menu) {
            this.menu.remove()
        }
        const menuNode = this.nodes.find(d => d.menu)
        if (menuNode !== undefined) {
            menuNode.menu = null
            setTimeout(() => {
                menuNode.fx = null
                menuNode.fy = null
            }, 600)
        }
        this.svg.classed('menu-mode', false)
    }

    this.svg = d3.select('#mg')
        .append('svg')
        .attr('width', width)
        .attr('height', height)

    this.dismissRect = this.svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .classed('dismiss-rect', true)
        .style('fill', 'none')
        .on('mousedown', this.dismiss)

    this.panRect = this.svg.append('rect')
        .attr('width', width)
        .attr('height', height)
        .classed('pan-rect', true)
        .style('fill', 'none')
        .call(d3.zoom()
            .scaleExtent(config.scaleExtent)
            .on('zoom', this.zoomed)
        )
        .on('click', this.dismiss)

    this.container = this.svg.append('g')
        .attr('id', 'container')

    this.container.append('g').attr('id', 'links')
    this.container.append('g').attr('id', 'nodes')
    this.container.append('g').attr('id', 'menu')
    this.container.append('g').attr('id', 'labels')

    this.dragStarted = (d) => {
        if (d.menu) {
            return
        }
        if (!d3.event.active) {
            this.simulation.alphaTarget(config.initialAlphaTarget).restart()
        }
        d.fx = d.x
        d.fy = d.y
    }

    this.dragged = (d) => {
        if (d.menu) {
            return
        }
        d.fx = d3.event.x
        d.fy = d3.event.y
    }

    this.dragEnded = (d) => {
        if (d.menu) {
            return
        }
        if (!d3.event.active) {
            this.simulation.alphaTarget(0)
        }

        d.fx = null
        d.fy = null
    }

    this.nodeHover = (d) => {
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
            n.node.sourceLinks.has(d.id) ||
            n.node.targetLinks.has(d.id) ||
            n.node.id === d.id)

        this.node.classed('hover', n => n.id === d.id)
    }

    this.nodeOut = () => {
        this.svg.classed('hover', false)
        this.label.classed('selected', false)
        this.link.classed('selected', false)
        this.node.classed('selected', false)
        this.node.classed('hover', false)
    }

    this.makeMenu = function (d) {
        let items = []
        let i = 0
        if (d.type === 'Group' || d.type === 'Artist') {
            items.push({
                idx: i++,
                icon: icons.guitar,
                title: 'Members',
                fn: (d) => {
                    this.api.getGroupMembers(d.mbid, d.id)
                        .then(data => {
                            this.addNodes(data.newNodes, data.relations, d.id)
                        })
                }
            })
        }
        if ((d.type === 'Group' || d.type === 'Artist') &&
            this._data.hoverArtist !== undefined && this._data.hoverArtist.id !== d.id) {
            items.push({
                idx: i++,
                icon: icons.path,
                title: 'Path to here',
                fn: (d) => {
                    this.api.getPath(this._data.hoverArtist.mbid, d.mbid)
                        .then(data => {
                            if (data.newNodes.length > 0) {
                                this.addNodes(data.newNodes, data.relations)
                            }
                        })
                }
            })
        }
        if ((d.type === 'Group' || d.type === 'Artist')) {
            items.push({
                idx: i++,
                icon: icons.expand,
                title: 'Related',
                fn: (d) => {
                    this.api.getRelatedByMbid(d.mbid)
                        .then(data => {
                            if (data.newNodes.length > 0) {
                                this.expandedNodes.add(d.id)
                                this.addNodes(data.newNodes, data.relations, d.id)
                            }
                        })
                }
            })
        }
        if (d.type === 'Tag') {
            items.push({
                idx: i++,
                icon: icons.expand,
                title: 'Related',
                fn: (d) => {
                    this.api.getRelatedTags(d.id)
                        .then(data => {
                            this.addNodes(data.newNodes, data.relations, d.id)
                        })
                }
            })
        }
        // if ((d.type === 'Artist' || d.type === 'Group')) {
        //     items.push({
        //         idx: i++,
        //         icon: icons.label,
        //         title: 'Label',
        //         fn: (d) => {
        //             this.api.getArtistLabels(d.mbid, d.id)
        //                 .then(data => {
        //                     this.addNodes(data.newNodes, data.relations, d.id)
        //                 })
        //         }
        //     })
        // }
        if (d.type === 'Album' || d.type === 'EP' || d.type === 'Single' || d.type === 'Group' || d.type === 'Artist') {
            let fn
            if (d.type === 'Group' || d.type === 'Artist') {
                fn = (d) => {
                    this.api.getArtistTags(d.mbid, d.id)
                        .then(data => {
                            this.addNodes(data.newNodes, data.relations, d.id)
                        })
                }
            } else if (d.type === 'Album' || d.type === 'EP' || d.type === 'Single') {
                fn = (d) => {
                    this.api.getReleaseDetails(d.mbid, d.id)
                        .then(data => {
                            this.addNodes(data.newNodes, data.relations, d.id)
                        })
                }
            }

            items.push({
                idx: i++,
                icon: icons.hash,
                title: 'Tags',
                fn: fn
            })
        }
        if (d.type === 'Tag') {
            items.push({
                idx: i++,
                icon: icons.expand,
                title: 'Related',
                fn: (d) => {
                    this.api.getRelatedByTag(d.id)
                        .then(data => {
                            this.addNodes(data.newNodes, data.relations, d.id)
                        })
                }
            })
        }
        items.push({
            idx: i,
            icon: icons.delete,
            title: 'Remove from graph',
            fn: (d) => {
                this.removeNodes([d.id])
            }
        })

        this.menu = this.container.select('#menu')
            .selectAll('g')
            .data(items)
            .enter()
            .append('g')
            .classed('menu-item', true)
            .attr('transform', `translate(${d.x},${d.y})`)

        const path = this.menu
            .append('path')
            .attr('d', item => arc(d.radius, item.idx, items.length, 1)())
        path
            .on('mouseover', d => {
                this.menu.classed('hover', item => item.idx === d.idx)
            })
            .on('mouseout', () => this.menu.classed('hover', false))
            .on('mousedown', tab => {
                this.dismiss()
                return tab.fn(d)
            })
            .transition()
            .duration(200)
            .attr('d', item => arc(d.radius, item.idx, items.length, 30)())
        path
            .append('title')
            .text(item => item.title)

        const centroid = (idx, rad) => arc(rad, idx, items.length, 30).centroid()
        this.menu
            .append('g')
            .html(d => d.icon)
            .classed('menu-icon', true)
            .attr('transform', d => `translate(${centroid(d.idx, 1)[0] - 13}, ${centroid(d.idx, 1)[1] - 13})`)
            .transition()
            .duration(250)
            .attr('transform', item => `translate(${centroid(item.idx, d.radius)[0] - 10}, ${centroid(item.idx, d.radius)[1] - 10})`)
    }

    this.nodeDbClick = (d) => {
        this.dismiss()
        if (this.svg.classed('menu-mode')) {
            return
        }

        this.svg.classed('menu-mode', true)
        d.menu = true

        d.fx = d.x
        d.fy = d.y

        this.makeMenu(d)
        d3.event.preventDefault()
    }

    this.nodeClick = (d) => {
        this.dismiss()
        if (d.type === 'Group' || d.type === 'Artist') {
            // Toggle artistInfo
            this.nodes.forEach(x => {
                x.hover = false
            })
            if (this._data.hoverArtist === d) {
                this._data.hoverArtist = undefined
            } else {
                this._data.hoverArtist = d
                d.hover = true
            }
            this._update()
        }
    }

    this.addNodes = function (newNodes, relations, originId) {
        // Update node map, ignore existing nodes
        let nodesToAdd = []

        // If we're adding a single node and it already exists, select it
        if (newNodes.length === 1 && this.nodeById.has(newNodes[0].id)) {
            this.nodes.forEach(x => {
                x.hover = false
            })
            this._data.hoverArtist = this.nodeById.get(newNodes[0].id)
            this._data.hoverArtist.hover = true
            this._update()
            return
        }

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
            } else {
                d.x = width / 2
                d.y = height / 2
            }

            nodesToAdd.push(d)
        })

        // Convert {id, id} relation to {node, node}
        let linksToAdd = relations
            .filter(rel => this.nodeById.has(rel.source) && this.nodeById.has(rel.target))
            .map(({weight, source, target}) => ({
                source: this.nodeById.get(source),
                target: this.nodeById.get(target),
                weight: weight
            }))

        // Update source/targetLinks, avoid bidirectional links
        for (const {source, target} of linksToAdd) {
            if (!target.sourceLinks.has(source.id)) {
                source.sourceLinks.add(target.id)
            }
            if (!source.targetLinks.has(target.id)) {
                target.targetLinks.add(source.id)
            }
        }

        this.nodeCount += nodesToAdd.length

        this.nodes.push(...nodesToAdd)
        this.links.push(...linksToAdd)

        if (!this._originSet && originId) {
            this.originArtist = this.nodeById.get(originId)
            this._setOrigin()
            this._originSet = true
        }

        this._update()
    }

    this.removeNodes = function (idsToRemove) {
        let idSetToRemove = new Set(idsToRemove)
        // Remove child nodes
        idsToRemove.forEach(id => {
            this.nodeById.get(id).sourceLinks.forEach(childId => idSetToRemove.add(childId))
        })

        // Update node link cache
        idSetToRemove.forEach(id => {
            let node = this.nodeById.get(id)
            Array.from(node.sourceLinks)
                .map(srcId => this.nodeById.get(srcId))
                .forEach(target => {
                    target.targetLinks.delete(id)
                })
            Array.from(node.targetLinks)
                .map(srcId => this.nodeById.get(srcId))
                .forEach(target => {
                    target.sourceLinks.delete(id)
                })
        })

        // Remove links
        this.links = this.links.filter(l =>
            !idSetToRemove.has(l.target.id) &&
            !idSetToRemove.has(l.source.id)
        )

        // Remove nodes
        idSetToRemove.forEach(id => {
            this.nodeById.delete(id)
            if (this.expandedNodes.has(id)) {
                this.expandedNodes.delete(id)
                this.nodeCount--
            }
            if (this._data.hoverArtist && id === this._data.hoverArtist.id) {
                this._data.hoverArtist = undefined
            }
        })
        this.nodes = this.nodes.filter(d => !idSetToRemove.has(d.id))

        this.nodeCount -= idSetToRemove.size

        this._update()
    }

    this._update = function () {
        this.simulation.nodes(this.nodes)
        this.simulation
            .force('link', d3.forceLink(this.links)
                .id(d => d.id)
                .strength(d => config.linkStrength(d, this.nodeCount))
                .distance(d => config.linkDistance(d, this.nodeCount))
            )

        this.simulation.alphaTarget(config.restartAlphaTarget).restart()

        // Add new links
        this.link = this.container.select('#links')
            .selectAll('.link')
            .data(this.links)
        this.link.exit().remove()
        this.link = this.link
            .enter()
            .append('line')
            .merge(this.link)
            .classed('link', true)
            .attr('stroke', d => this._getLinkColor(d))

        // Add new nodes
        this.node = this.container.select('#nodes')
            .selectAll('.node')
            .attr('stroke', d => this._getNodeColor(d))
            .data(this.nodes)
        this.node.exit().remove()
        this.node = this.node
            .enter()
            .append('circle')
            .merge(this.node)
        this.node
            .classed('node', true)
            .attr('r', d => d.radius)
            .attr('stroke', d => this._getNodeColor(d))
            .call(d3.drag()
                .on('start', this.dragStarted)
                .on('drag', this.dragged)
                .on('end', this.dragEnded))
            .on('mouseover', this.nodeHover)
            .on('mouseout', this.nodeOut)
            .on('contextmenu', this.nodeDbClick)
            .on('click', this.nodeClick)

        // Add new labels
        this.label = this.container.select('#labels')
            .selectAll('.label')
            .data([].concat(...this.nodes.map(d => fitCaptionIntoCircle(d.name, d))))
        this.label.exit().remove()
        this.label = this.label
            .enter()
            .append('text')
            .merge(this.label)
            .classed('label', true)
            .classed('release', d => d.node.type === 'Album' || d.node.type === 'EP' || d.node.type === 'Single')
            .classed('tag', d => d.node.type === 'Tag')
            .text(d => d.text)
    }

    this.setupKeyBindings = function () {
        document.body.onkeydown = (e) => {
            if (e.ctrlKey) {
                this.svg.classed('pan-mode', true)
            }
        }

        document.body.onkeyup = (e) => {
            if (e.key === 'Control') {
                this.svg.classed('pan-mode', false)
            }
        }

        document.body.onmouseleave = () => {
            this.svg.classed('pan-mode', false)
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
        if (node.hover) {
            return '#FF0000'
        }
        if (this.expandedNodes.has(node.id)) {
            return '#1cb3c8'
        }
        return null
    }

    this._getLinkColor = function (node) {
        return '#FF0000'
    }

    this.addArtistByMbid = function (mbid) {
        this.api.getRelatedByMbid(mbid)
            .then(data => {
                this.addNodes([data.node], data.relations)
            })
    }

    this.addTagById = function (tagid) {
        if (this.nodeById.has(tagid)) {
            return
        }
        this.api.getRelatedByTag(tagid)
            .then(data => {
                // Force tag->artist direction
                const relations = data.relations.map(rel => {
                    if (rel.source === data.node.id) {
                        return {
                            weight: rel.weight,
                            source: rel.target,
                            target: rel.source
                        }
                    } else {
                        return rel
                    }
                })
                this.addNodes([data.node], relations)
            })
    }

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
            .attr('x', d => d.node.x)
            .attr('y', d => d.node.y + d.baseline)
    })

    this._update()
    this.setupKeyBindings()
}
