$( function() {
	$( '#lVideo' ).draggable({ snap: true });
	$( '#lVideo' ).resizable({
		helper: "ui-resizable-helper"
    });
	$( '#rVideo' ).draggable({ snap: true });
	$( '#lVideo' ).resizable({
		helper: "ui-resizable-helper"
	});
	$(":checkbox").checkboxradio({
		icon: false
    });
});