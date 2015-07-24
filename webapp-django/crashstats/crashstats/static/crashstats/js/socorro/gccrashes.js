/*global socorro:false, $:false, nv:false, d3:false */

$(function() {
    'use strict';
    var form = $('#gccrashes');
    var baseUrl = form.data('base-url');

    var productSelector = $('#product');
    var versionSelector = $('#version');
    var startDateElem = $("#start_date");
    var endDateElem = $("#end_date");

    /**
     * Builds the URL for plotGraph
     * @param {object} form - A jQuery form object to serialize
     * @returns returns the ajaxUrl
     */
    function buildUrl(form) {
        var params = form.find(':input:not(:hidden)').serialize();
        return baseUrl + '?' + params;
    }

    var graphContainer = $('#gccrashes_graph');

    /**
     * Draws the graph.
     * @param {string} ajaxUrl - The url end point from which to retrieve data.
     */
    function plotGraph(ajaxUrl) {
        $.getJSON(ajaxUrl, function(data) {
            // Remove the loader.
            socorro.ui.removeLoader();

            // Only set the dimensions of the container if there is actual data.
            if (data.total > 0) {
                graphContainer.addClass('gccrashes_graph');

                // Format the data for the graph.
                var graphData = $.map(data.hits, function(hit) {
                    return {
                        'build_id': hit[0],
                        'crashes': hit[1]
                    };
                });

                // Draw the graph.
                MG.data_graphic({
                    data: graphData,
                    chart_type: 'bar',
                    full_width: true,
                    bar_orientation: 'vertical',
                    target: '#gccrashes_graph',
                    x_accessor: 'build_id',
                    y_accessor: 'crashes',
                    rotate_x_labels: -50,
                    truncate_x_labels: false,
                    bottom: 80,
                    mouseover: function(d, i) {
                        $('.mg-active-datapoint')
                            .html('Build ID: ' + graphData[i].build_id +
                                ', GC crashes: ' + graphData[i].crashes
                            );
                    }
                });
            } else {
                graphContainer.text('No results were found.');
            }
        });
    }

    // Do not try to load graph data if there were django form
    // validation errors.
    if (!$('.django-form-error').length) {
        socorro.ui.setLoader(graphContainer);
        plotGraph(buildUrl(form));
    }

    /**
     * Displays a list of error messages.
     * @param {object} form - The form to prepend the messages to as a jQuery object.
     * @param {array} errors - The array of error messages to prepend.
     */
    function showFormErrors(form, errors) {
        var errorsLength = errors.length;

        var errorsContainer = $('<ul />', { class: 'user-msg error' });

        for (var i = 0; i < errorsLength; i++) {
            errorsContainer.append($('<li />', {
                text: errors[i]
            }));
        }
        form.prepend(errorsContainer);
    }

    /**
     * Validates the current form and return true or
     * an errors array.
     * @param {object} form - The form as a jQuery object.
     */
    function isValid(form) {
        var errors = [];

        // Clear any previous messages
        $('.user-msg').remove();

        var selectedProduct = productSelector.val();
        var selectedVersion = versionSelector.val();
        var endDate = endDateElem.val();
        var startDate = startDateElem.val();

        if (socorro.date.isFutureDate(endDate) || socorro.date.isFutureDate(startDate)) {
            errors.push('Dates cannot be in the future.');
        }

        if (!socorro.date.isValidDuration(startDate, endDate, 'less')) {
            errors.push('The from date should be less than the to date.');
        }

        if (errors.length > 0) {
            showFormErrors(form, errors);
            return false;
        }

        return true;
    }

    /**
     * Sets the document title and the page heading to the newly
     * selected version.
     * @param {object} values - An object containing the selected version and product.
     */
    function setTitle(values) {
        var pageHeading = $('#gcc-main-title');
        var tmpl = pageHeading.data('template');
        var newTitle = tmpl.replace('$VERSION', values.version).replace('$PRODUCT', values.product);

        pageHeading.text(newTitle);
        document.title = newTitle;
    }

    var state = {};
    /**
     * Updates the URL and changes the browser history using replace state
     * to ensure URLs are always bookmarkable.
     * @param {object} values - An object containing the selected version and product.
     */
    function setHistory(values) {
        var params = window.location.search || '?' + $('input[type="date"]').serialize();
        var report = form.data('report');
        var historyEntry = '/' + report + '/products/' + values.product + '/versions/' + values.version;

        history.replaceState(state, document.title, historyEntry + params);
    }

    form.on('submit', function(event) {

        event.preventDefault();

        if (isValid(form)) {
            var values = {
                version: versionSelector.val(),
                product: productSelector.val()
            };

            // Clear out the graph container.
            graphContainer.empty();
            // Remove class from container so it will collapse.
            graphContainer.removeClass('gccrashes_graph');

            // Set title, page heading and update URL/browser history
            setTitle(values);
            setHistory(values);

            socorro.ui.setLoader(graphContainer);
            plotGraph(buildUrl(form));
        }
    });

    $(startDateElem).add(endDateElem).on('change', function() {
        var pathName = window.location.pathname;
        var params = $('input[type="date"]').serialize();
        history.replaceState(state, document.title, pathName + '?' + params);
    });

    versionSelector.on('change', function() {
        var values = {
            version: versionSelector.val(),
            product: productSelector.val()
        };

        setTitle(values);
        setHistory(values);
    });

    productSelector.on('change', function() {

        // Clear any previous messages
        $('.user-msg').remove();

        var jsonUrl = form.data('versions-url');

        versionSelector.empty();
        socorro.ui.setLoader(versionSelector.parents('div'), 'versions-loader', true);

        $.getJSON(jsonUrl, { product: productSelector.val() }, function(versions) {

            socorro.ui.removeLoader('versions-loader');
            var versionsLength = versions.length;

            if (versionsLength) {

                var options = [];

                $.each(versions, function(i, version) {
                    options.push($('<option />', {
                        value: version,
                        text: version
                    }));
                });

                versionSelector.append(options);

                var values = {
                    version: versionSelector.val(),
                    product: productSelector.val()
                };

                setTitle(values);
                setHistory(values);
            } else {
                showFormErrors(form, ['No versions found for product.']);
            }
        })
        .fail(function(jqXHR, textStatus, errorThrown) {
            socorro.ui.removeLoader('versions-loader');
            if (textStatus !== null && textStatus !== 'abort') {
                showFormErrors(form, ['Error while loading version: ' + errorThrown]);
            }
        });
    });

    var dateFields = $("input[type='date']", form);

    //check if the HTML5 date type is supported else, fallback to jQuery UI
    if(!socorro.dateSupported()) {
        dateFields.datepicker({
            dateFormat: "yy-mm-dd"
        });
    }
});
